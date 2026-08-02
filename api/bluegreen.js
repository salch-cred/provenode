/**
 * Blue-Green Deployment Controller
 * GET    /api/bluegreen               — list all blue-green configs
 * POST   /api/bluegreen               — create / update config
 * POST   /api/bluegreen/switch        — swap active slot (blue ↔ green)
 * GET    /api/bluegreen/:projectId    — single project config
 */
import { getDB } from './lib/kv.js';
import { logAudit } from './lib/audit.js';
import { dispatch } from './lib/notify.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  const db = getDB();

  const url = new URL(req.url, 'http://localhost');
  const parts = url.pathname.replace('/api/bluegreen','').split('/').filter(Boolean);

  if (req.method === 'GET') {
    if (parts[0]) {
      const raw = await db.get(`bluegreen:${parts[0]}`);
      if (!raw) return res.status(404).json({ error: 'Not found.' });
      return res.status(200).json({ success: true, config: JSON.parse(raw) });
    }
    const { keys } = await db.list({ prefix: 'bluegreen:' });
    const configs = (await Promise.all(keys.map(async ({ name }) => {
      const d = await db.get(name); return d ? JSON.parse(d) : null;
    }))).filter(Boolean);
    return res.status(200).json({ success: true, configs });
  }

  if (req.method === 'POST') {
    // Switch active slot
    if (parts[0] === 'switch') {
      const { projectId } = req.body || {};
      if (!projectId) return res.status(400).json({ error: 'projectId required.' });
      const raw = await db.get(`bluegreen:${projectId}`);
      if (!raw) return res.status(404).json({ error: 'Project not found.' });
      const config = JSON.parse(raw);
      const prev = config.activeSlot;
      config.activeSlot = config.activeSlot === 'blue' ? 'green' : 'blue';
      config.lastSwitchedAt = new Date().toISOString();
      config.history = config.history || [];
      config.history.unshift({ from: prev, to: config.activeSlot, at: config.lastSwitchedAt });
      config.history = config.history.slice(0, 20);
      await db.put(`bluegreen:${projectId}`, JSON.stringify(config));
      await logAudit('bluegreen.switched', { target: projectId, details: { from: prev, to: config.activeSlot } });
      await dispatch('bluegreen.switched', { projectId, from: prev, to: config.activeSlot });
      return res.status(200).json({ success: true, config, switched: { from: prev, to: config.activeSlot } });
    }

    // Create/update config
    const { projectId, name, blueDeploymentId, greenDeploymentId, activeSlot } = req.body || {};
    if (!projectId || !name) return res.status(400).json({ error: 'projectId and name required.' });
    const existing = await db.get(`bluegreen:${projectId}`);
    const config = {
      ...(existing ? JSON.parse(existing) : {}),
      projectId, name,
      blueDeploymentId: blueDeploymentId || null,
      greenDeploymentId: greenDeploymentId || null,
      activeSlot: activeSlot || 'blue',
      createdAt: existing ? JSON.parse(existing).createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      history: existing ? JSON.parse(existing).history || [] : [],
    };
    await db.put(`bluegreen:${projectId}`, JSON.stringify(config));
    await logAudit('bluegreen.configured', { target: projectId, details: { name } });
    return res.status(201).json({ success: true, config });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}
