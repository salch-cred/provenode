import { Redis } from "@upstash/redis";

// Initialize Redis from env vars auto-injected by Vercel KV/Upstash integration
const redis = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// In-memory fallback used when KV env vars are not configured (local dev)
const _localStore = new Map();

/**
 * Sanitize a tenant id before it becomes a KV key prefix.
 *
 * SECURITY: the tenant id arrives from a client header. Two rules:
 *  1. `global` / `admin-override` must NOT be honoured as namespace escapes —
 *     a client that sends them would otherwise read and write the shared
 *     namespace where audit records, payments and webhooks live.
 *  2. Redis glob metacharacters (* ? [ ]) must be stripped so a crafted id
 *     cannot widen a later SCAN MATCH pattern beyond its own namespace.
 */
function safeTenantPrefix(tenantId) {
  const raw = String(tenantId ?? '').trim();
  if (!raw) return '';
  // Escape hatches are only honoured server-side (never from a header).
  if (raw === 'global' || raw === 'admin-override') return '';
  const cleaned = raw.replace(/[^A-Za-z0-9:_.\-]/g, '').slice(0, 128);
  return cleaned ? `${cleaned}:` : '';
}

/**
 * Escape Redis glob metacharacters in a SCAN MATCH pattern so user-supplied
 * key segments (modelId, deviceId, runId, ...) cannot broaden the match.
 * Without this, `DELETE /api/inference-cache?modelId=*` would list — and
 * delete — every cache key rather than one model's.
 */
function escapeGlob(s) {
  return String(s ?? '').replace(/([*?[\]\\^])/g, '\\$1');
}

export function getDB(tenantId = '') {
  const tPrefix = safeTenantPrefix(tenantId);

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return {
      async put(key, value) { _localStore.set(tPrefix + key, typeof value === 'string' ? value : JSON.stringify(value)); },
      async get(key) { return _localStore.get(tPrefix + key) ?? null; },
      async del(key) { _localStore.delete(tPrefix + key); },
      async list({ prefix = '' } = {}) {
        const fullPrefix = tPrefix + prefix;
        const keys = [..._localStore.keys()].filter(k => k.startsWith(fullPrefix));
        return { keys: keys.map(n => ({ name: n.slice(tPrefix.length) })) };
      },
    };
  }
  return {
    async put(key, value) {
      await redis.set(tPrefix + key, value);
    },
    async get(key) {
      const val = await redis.get(tPrefix + key);
      if (val === null || val === undefined) return null;
      return typeof val === "string" ? val : JSON.stringify(val);
    },
    async del(key) {
      await redis.del(tPrefix + key);
    },
    async list({ prefix = "" } = {}) {
      const fullPrefix = tPrefix + prefix;
      const pattern = fullPrefix ? `${escapeGlob(fullPrefix)}*` : "*";
      const allKeys = [];
      let cursor = 0;
      // Hard cap: prevents one request from pulling an unbounded keyspace into
      // memory (the audit and analytics prefixes grow without bound).
      const MAX_KEYS = 5000;
      do {
        const [nextCursor, batch] = await redis.scan(cursor, { match: pattern, count: 200 });
        cursor = Number(nextCursor);
        if (batch && batch.length) allKeys.push(...batch);
      } while (cursor !== 0 && allKeys.length < MAX_KEYS);
      return { keys: allKeys.slice(0, MAX_KEYS).map((n) => ({ name: n.slice(tPrefix.length) })) };
    },
  };
}
