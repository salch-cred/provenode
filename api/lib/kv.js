import { kv } from '@vercel/kv';
export function getDB() {
  return {
    async put(key, value) { await kv.set(key, value); },
    async get(key) {
      const val = await kv.get(key);
      if (val === null || val === undefined) return null;
      return typeof val === 'string' ? val : JSON.stringify(val);
    },
    async del(key) { await kv.del(key); },
    async list({ prefix = '' } = {}) {
      const names = await kv.keys(prefix ? `${prefix}*` : '*');
      return { keys: names.map(n => ({ name: n })) };
    },
  };
}
