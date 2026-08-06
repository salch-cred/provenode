import { Redis } from "@upstash/redis";

// Initialize Redis from env vars auto-injected by Vercel KV/Upstash integration
const redis = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// In-memory fallback used when KV env vars are not configured (local dev)
const _localStore = new Map();

export function getDB() {
  // No KV credentials → return a local in-memory stub (data is NOT persisted across reloads)
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return {
      async put(key, value) { _localStore.set(key, typeof value === 'string' ? value : JSON.stringify(value)); },
      async get(key) { return _localStore.get(key) ?? null; },
      async del(key) { _localStore.delete(key); },
      async list({ prefix = '' } = {}) {
        const keys = [..._localStore.keys()].filter(k => k.startsWith(prefix));
        return { keys: keys.map(n => ({ name: n })) };
      },
    };
  }
  return {
    async put(key, value) {
      await redis.set(key, value);
    },
    async get(key) {
      const val = await redis.get(key);
      if (val === null || val === undefined) return null;
      return typeof val === "string" ? val : JSON.stringify(val);
    },
    async del(key) {
      await redis.del(key);
    },
    // FIX H-4: Use SCAN cursor instead of KEYS to avoid blocking Redis on large keyspaces
    async list({ prefix = "" } = {}) {
      const pattern = prefix ? `${prefix}*` : "*";
      const allKeys = [];
      let cursor = 0;
      do {
        const [nextCursor, batch] = await redis.scan(cursor, { match: pattern, count: 200 });
        cursor = Number(nextCursor);
        if (batch && batch.length) allKeys.push(...batch);
      } while (cursor !== 0);
      return { keys: allKeys.map((n) => ({ name: n })) };
    },
  };
}
