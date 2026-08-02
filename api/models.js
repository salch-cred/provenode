/**
 * GET /api/models
 *
 * Returns all models registered in KV, sorted newest-first.
 * Never leaks internal fields (no Shelby API key values, etc.)
 *
 * Response (200):
 *   { success, models: Model[] }
 */

import { getDB } from './lib/kv.js';

// Fields safe to expose publicly
const PUBLIC_FIELDS = ['id', 'model', 'objectId', 'sha256', 'size', 'mode', 'createdAt'];

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const db = getDB();
  const { keys } = await db.list({ prefix: 'model:' });

  const models = await Promise.all(
    keys.map(async ({ name }) => {
      const data = await db.get(name);
      if (!data) return null;
      const record = JSON.parse(data);
      // Strip any fields not in PUBLIC_FIELDS
      return Object.fromEntries(
        PUBLIC_FIELDS.map(f => [f, record[f]]).filter(([, v]) => v !== undefined)
      );
    })
  );

  const filtered = models
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return res.status(200).json({ success: true, models: filtered });
}
