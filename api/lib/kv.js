import { Redis } from "@upstash/redis";

// Initialize Redis from env vars auto-injected by Vercel KV/Upstash integration
const redis = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export function getDB() {
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
    async list({ prefix = "" } = {}) {
      const pattern = prefix ? `${prefix}*` : "*";
      const names = await redis.keys(pattern);
      return { keys: (names || []).map((n) => ({ name: n })) };
    },
  };
}
