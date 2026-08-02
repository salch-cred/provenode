/**
 * Webhook management
 * POST   /api/webhooks          — register
 * GET    /api/webhooks          — list
 * DELETE /api/webhooks?id=xxx   — remove
 * POST   /api/webhooks/test     — send test event
 */
import { getDB } from './lib/kv.js';
import { dispatch } from './lib/notify.js';

const VALID_EVENTS = ['*','model.registered','model.imported','deployment.started','deployment.verified','deployment.rolled_back','canary.advanced','abtest.created','abtest.ended','integrity.mismatch','object.expiring_soon','object.tampered'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  const db = getDB();

  if (req.method === 'GET') {
    const { keys } = await db.list({ prefix: 'webhook:' });
    const hooks = (await Promise.all(keys.map(async ({ name }) => {
      const d = await db.get(name); if (!d) return null;
      const h = JSON.parse(d); return { ...h, secret: h.secret ? '***' : null };
    }))).filter(Boolean);
    return res.status(200).json({ success: true, webhooks: hooks, validEvents: VALID_EVENTS });
  }

  if (req.method === 'POST') {
    const { action, url, events, secret, name } = req.body || {};
    if (action === 'test') {
      await dispatch('test', { message: 'Provenode webhook test', timestamp: new Date().toISOString() });
      return res.status(200).json({ success: true, message: 'Test event dispatched.' });
    }
    if (!url) return res.status(400).json({ error: 'url required.' });
    try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL.' }); }
    const id = crypto.randomUUID();
    const hook = { id, name: name || url, url, events: events || ['*'], secret: secret || null, enabled: true, createdAt: new Date().toISOString() };
    await db.put(`webhook:${id}`, JSON.stringify(hook));
    return res.status(201).json({ success: true, webhook: { ...hook, secret: hook.secret ? '***' : null } });
  }

  if (req.method === 'DELETE') {
    const { id } = req.query; if (!id) return res.status(400).json({ error: 'id required.' });
    await db.del(`webhook:${id}`);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}
