/**
 * Vercel KV adapter — wraps @vercel/kv with the same interface
 * the Cloudflare KV binding exposed so the API handlers need zero changes.
 *
 * On Cloudflare: env.PROVENODE_DB.put(key, value)  /  .get(key)  /  .list({ prefix })
 * On Vercel:     kv.set(key, value)                /  .get(key)  /  kv.keys(pattern)
 *
 * Drop-in PROVENODE_DB shim:
 *   import { getDB } from './lib/kv.js'
 *   const db = getDB(env)
 *   await db.put('key', JSON.stringify(value))
 *   const raw = await db.get('key')                  // returns string | null
 *   const { keys } = await db.list({ prefix: 'x:' }) // keys = [{ name }]
 */

import { kv } from '@vercel/kv';

export function getDB() {
  return {
    /** Store a string value (mirrors CF KV put) */
    async put(key, value) {
      await kv.set(key, value);
    },

    /** Retrieve a string value (mirrors CF KV get) */
    async get(key) {
      const val = await kv.get(key);
      if (val === null || val === undefined) return null;
      // CF KV always returns strings; Vercel KV auto-parses JSON — re-stringify
      return typeof val === 'string' ? val : JSON.stringify(val);
    },

    /**
     * Scan keys by prefix (mirrors CF KV list).
     * Returns { keys: [{ name: string }] }
     */
    async list({ prefix = '' } = {}) {
      const pattern = prefix ? `${prefix}*` : '*';
      const names = await kv.keys(pattern);
      return { keys: names.map(n => ({ name: n })) };
    },
  };
}
