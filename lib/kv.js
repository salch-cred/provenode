import { Redis } from "@upstash/redis";

// Initialize Redis from env vars auto-injected by Vercel KV/Upstash integration
const redis = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// In-memory fallback used when KV env vars are not configured (local dev)
const _localStore = new Map();

export function getDB(tenantId = '') {
  const tPrefix = (tenantId && tenantId !== 'global' && tenantId !== 'admin-override') ? `${tenantId}:` : '';
  
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
      const pattern = fullPrefix ? `${fullPrefix}*` : "*";
      const allKeys = [];
      let cursor = 0;
      do {
        const [nextCursor, batch] = await redis.scan(cursor, { match: pattern, count: 200 });
        cursor = Number(nextCursor);
        if (batch && batch.length) allKeys.push(...batch);
      } while (cursor !== 0);
      return { keys: allKeys.map((n) => ({ name: n.slice(tPrefix.length) })) };
    },
  };
}
