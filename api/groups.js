/**
 * Fleet Groups — tag-based device targeting for deployments
 * GET    /api/groups          — list groups
 * POST   /api/groups          — create group
 * GET    /api/groups?id=xxx   — single group with member devices
 * PATCH  /api/groups          — update group
 * DELETE /api/groups?id=xxx   — delete group
 */
import { getDB } from './lib/kv.js';
import { logAudit } from './lib/audit.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  const db = getDB();

  if (req.method === 'GET') {
    const { id } = req.query;
    if (!id) {
      const { keys } = await db.list({ prefix: 'group:' });
      const groups = (await Promise.all(keys.map(async ({ name }) => {
        const d = await db.get(name); return d ? JSON.parse(d) : null;
      }))).filter(Boolean);
      return res.status(200).json({ success: true, groups });
    }
    const raw = await db.get(`group:${id}`);
    if (!raw) return res.status(404).json({ error: 'Group not found.' });
    const group = JSON.parse(raw);
    // Resolve member devices
    const { keys: devKeys } = await db.list({ prefix: 'device:' });
    const members = (await Promise.all(devKeys.map(async ({ name }) => {
      const d = await db.get(name); if (!d) return null;
      const dev = JSON.parse(d);
      const matches = group.selector?.tags
        ? group.selector.tags.every(t => dev.fleet === t || dev.type === t || dev.location === t)
        : group.deviceIds?.includes(dev.id);
      return matches ? dev : null;
    }))).filter(Boolean);
    return res.status(200).json({ success: true, group, members, memberCount: members.length });
  }

  if (req.method === 'POST') {
    const { name, description, selector, deviceIds, color } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name required.' });
    const id = crypto.randomUUID();
    const group = {
      id, name, description: description || '',
      selector: selector || null, // { tags: ['production', 'camera'] }
      deviceIds: deviceIds || [],
      color: color || '#6366f1',
      createdAt: new Date().toISOString(),
    };
    await db.put(`group:${id}`, JSON.stringify(group));
    await logAudit('group.created', { target: id, details: { name } });
    return res.status(201).json({ success: true, group });
  }

  if (req.method === 'PATCH') {
    const { id, ...updates } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required.' });
    const raw = await db.get(`group:${id}`);
    if (!raw) return res.status(404).json({ error: 'Not found.' });
    const group = { ...JSON.parse(raw), ...updates, updatedAt: new Date().toISOString() };
    await db.put(`group:${id}`, JSON.stringify(group));
    return res.status(200).json({ success: true, group });
  }

  if (req.method === 'DELETE') {
    const { id } = req.query; if (!id) return res.status(400).json({ error: 'id required.' });
    await db.del(`group:${id}`);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}
