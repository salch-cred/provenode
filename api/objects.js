/**
 * Shelby Object Explorer
 * GET /api/objects           — list all registered Shelby objects with expiry status
 * GET /api/objects?expiring  — only objects expiring within 7 days
 */
import { getDB } from './lib/kv.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

  const db = getDB();
  const expiring = 'expiring' in (req.query || {});
  const { keys } = await db.list({ prefix: 'model:' });

  const now = Date.now();
  const sevenDays = 7 * 24 * 3600 * 1000;

  const objects = (await Promise.all(keys.map(async ({ name }) => {
    const d = await db.get(name); if (!d) return null;
    const m = JSON.parse(d);
    if (m.mode !== 'shelby') return null;

    const expiresAt = m.expiresAt ? new Date(m.expiresAt).getTime() : null;
    const daysLeft = expiresAt ? Math.floor((expiresAt - now) / 86400000) : null;
    const status = !expiresAt ? 'unknown' : daysLeft < 0 ? 'expired' : daysLeft < 7 ? 'expiring_soon' : 'healthy';

    return { id: m.id, model: m.model, objectId: m.objectId, sha256: m.sha256, size: m.size, address: m.address, expiresAt: m.expiresAt, daysLeft, status, createdAt: m.createdAt };
  }))).filter(r => r && (!expiring || r.status === 'expiring_soon' || r.status === 'expired'));

  const stats = { total: objects.length, healthy: objects.filter(o => o.status === 'healthy').length, expiringSoon: objects.filter(o => o.status === 'expiring_soon').length, expired: objects.filter(o => o.status === 'expired').length };

  return res.status(200).json({ success: true, objects, stats });
}
