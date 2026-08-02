/**
 * Scheduled Deployments
 * POST /api/schedule  — schedule a deployment
 * GET  /api/schedule  — list scheduled deployments
 * DELETE /api/schedule?id=xxx — cancel
 */
import { getDB } from './lib/kv.js';
import { logAudit } from './lib/audit.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  const db = getDB();

  if (req.method === 'GET') {
    const { keys } = await db.list({ prefix: 'scheduled:' });
    const jobs = (await Promise.all(keys.map(async ({ name }) => {
      const d = await db.get(name); return d ? JSON.parse(d) : null;
    }))).filter(Boolean).sort((a, b) => new Date(a.scheduledFor) - new Date(b.scheduledFor));
    return res.status(200).json({ success: true, jobs });
  }

  if (req.method === 'POST') {
    const { modelId, modelName, region, canary, scheduledFor, label, timezone } = req.body || {};
    if (!scheduledFor) return res.status(400).json({ error: 'scheduledFor (ISO datetime) is required.' });
    if (!modelId && !modelName) return res.status(400).json({ error: 'modelId or modelName required.' });

    const scheduledTs = new Date(scheduledFor).getTime();
    if (isNaN(scheduledTs)) return res.status(400).json({ error: 'Invalid scheduledFor date.' });
    if (scheduledTs < Date.now()) return res.status(400).json({ error: 'scheduledFor must be in the future.' });

    const id = crypto.randomUUID();
    const job = {
      id, modelId, modelName, region: region || 'Global', canary: !!canary,
      scheduledFor, label: label || `${modelName || modelId} @ ${scheduledFor}`,
      timezone: timezone || 'UTC', status: 'pending',
      createdAt: new Date().toISOString(),
    };
    await db.put(`scheduled:${scheduledTs}:${id}`, JSON.stringify(job));
    await logAudit('schedule.created', { target: id, details: { label: job.label, scheduledFor } });
    return res.status(201).json({ success: true, job });
  }

  if (req.method === 'DELETE') {
    const { id } = req.query; if (!id) return res.status(400).json({ error: 'id required.' });
    const { keys } = await db.list({ prefix: 'scheduled:' });
    for (const { name } of keys) {
      if (name.endsWith(id)) { await db.del(name); break; }
    }
    await logAudit('schedule.cancelled', { target: id });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}
