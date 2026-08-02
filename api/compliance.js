/**
 * Compliance Report Export
 * GET /api/compliance/report?from=YYYY-MM-DD&to=YYYY-MM-DD&format=json|csv
 */
import { getDB } from './lib/kv.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

  const { from, to, format = 'json' } = req.query;
  const fromTs = from ? new Date(from).getTime() : 0;
  const toTs = to ? new Date(to).getTime() : Date.now();

  const db = getDB();
  const [modelsRes, deploysRes, devicesRes] = await Promise.all([
    db.list({ prefix: 'model:' }),
    db.list({ prefix: 'deployment:' }),
    db.list({ prefix: 'device:' }),
  ]);

  const inRange = (iso) => { const t = new Date(iso).getTime(); return t >= fromTs && t <= toTs; };

  const models = (await Promise.all(modelsRes.keys.map(async ({ name }) => {
    const d = await db.get(name); if (!d) return null;
    const m = JSON.parse(d);
    return inRange(m.createdAt) ? { id: m.id, model: m.model, sha256: m.sha256, size: m.size, mode: m.mode, objectId: m.objectId, createdAt: m.createdAt } : null;
  }))).filter(Boolean);

  const deployments = (await Promise.all(deploysRes.keys.map(async ({ name }) => {
    const d = await db.get(name); if (!d) return null;
    const m = JSON.parse(d);
    return inRange(m.createdAt) ? { id: m.id, model: m.model, version: m.version, sha256: m.sha256, shelbyObjectId: m.shelbyObjectId, manifestObjectId: m.manifestObjectId, status: m.status, region: m.region, mode: m.mode, createdAt: m.createdAt } : null;
  }))).filter(Boolean);

  const devices = (await Promise.all(devicesRes.keys.map(async ({ name }) => {
    const d = await db.get(name); if (!d) return null;
    return JSON.parse(d);
  }))).filter(Boolean);

  const report = {
    generatedAt: new Date().toISOString(),
    period: { from: from || 'all-time', to: to || new Date().toISOString() },
    summary: { models: models.length, deployments: deployments.length, devices: devices.length, shelbyMode: models.filter(m => m.mode === 'shelby').length },
    models, deployments, devices,
  };

  if (format === 'csv') {
    const lines = ['id,model,sha256,mode,objectId,createdAt', ...models.map(m => `${m.id},${m.model},${m.sha256},${m.mode},${m.objectId},${m.createdAt}`)];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="provenode-compliance-${Date.now()}.csv"`);
    return res.status(200).send(lines.join('\n'));
  }

  return res.status(200).json({ success: true, report });
}
