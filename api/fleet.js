/**
 * OTA Fleet Management + Canary Automation
 * GET  /api/fleet/:deviceId/pending   — what model should device pull
 * POST /api/fleet/:deviceId/report    — device reports health
 * POST /api/fleet/canary/:id/advance  — advance canary stage
 * POST /api/fleet/canary/:id/rollback — rollback
 */
import { getDB } from './lib/kv.js';
import { dispatch } from './lib/notify.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  const db = getDB();

  const url = new URL(req.url, `http://localhost`);
  const parts = url.pathname.replace('/api/fleet', '').split('/').filter(Boolean);

  // GET /api/fleet/:deviceId/pending
  if (req.method === 'GET' && parts[1] === 'pending') {
    const deviceId = parts[0];
    const raw = await db.get(`device:${deviceId}`);
    const device = raw ? JSON.parse(raw) : null;
    const fleet = device?.fleet || 'default';

    // Find most recent active deployment for this device's fleet
    const { keys } = await db.list({ prefix: 'deployment:' });
    const deployments = (await Promise.all(keys.map(async ({ name }) => {
      const d = await db.get(name); return d ? JSON.parse(d) : null;
    }))).filter(d => d && d.status !== 'rolled_back').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const pending = deployments[0];
    if (!pending) return res.status(200).json({ pending: false });

    if (device?.currentModelId === pending.modelId) return res.status(200).json({ pending: false, upToDate: true });

    return res.status(200).json({
      pending: true,
      deploymentId: pending.id,
      modelId: pending.modelId,
      shelbyObjectId: pending.shelbyObjectId,
      sha256: pending.sha256,
      version: pending.version,
      manifestObjectId: pending.manifestObjectId,
    });
  }

  // POST /api/fleet/:deviceId/report
  if (req.method === 'POST' && parts[1] === 'report') {
    const deviceId = parts[0];
    const { deploymentId, status, sha256Match, latencyMs, error } = req.body || {};
    const raw = await db.get(`device:${deviceId}`);
    if (raw) {
      const device = JSON.parse(raw);
      device.lastSeenAt = new Date().toISOString();
      device.status = status === 'healthy' ? 'online' : 'error';
      if (sha256Match && deploymentId) { device.currentModelId = deploymentId; }
      await db.put(`device:${deviceId}`, JSON.stringify(device));
    }

    if (deploymentId && sha256Match) {
      const dd = await db.get(`devices:${deploymentId}`);
      if (dd) {
        const devices = JSON.parse(dd);
        devices.verified = Math.min(devices.target, devices.verified + 1);
        await db.put(`devices:${deploymentId}`, JSON.stringify(devices));
      }
    }

    if (!sha256Match) await dispatch('integrity.mismatch', { deviceId, deploymentId, error });
    return res.status(200).json({ success: true });
  }

  // POST /api/fleet/canary/:id/advance
  if (req.method === 'POST' && parts[0] === 'canary' && parts[2] === 'advance') {
    const id = parts[1];
    const raw = await db.get(`deployment:${id}`);
    if (!raw) return res.status(404).json({ error: 'Not found.' });
    const manifest = JSON.parse(raw);
    if (!manifest.canary) return res.status(400).json({ error: 'Not a canary deployment.' });
    const stages = manifest.canary.stages;
    const next = manifest.canary.currentStage + 1;
    if (next >= stages.length) { manifest.canary.currentStage = stages.length - 1; manifest.status = 'verified'; }
    else manifest.canary.currentStage = next;
    manifest.canary.advancedAt = new Date().toISOString();
    await db.put(`deployment:${id}`, JSON.stringify(manifest));
    await dispatch('canary.advanced', { id, stage: stages[manifest.canary.currentStage] });
    return res.status(200).json({ success: true, manifest });
  }

  // POST /api/fleet/canary/:id/rollback
  if (req.method === 'POST' && parts[0] === 'canary' && parts[2] === 'rollback') {
    const id = parts[1];
    const raw = await db.get(`deployment:${id}`);
    if (!raw) return res.status(404).json({ error: 'Not found.' });
    const manifest = JSON.parse(raw);
    manifest.status = 'rolled_back'; manifest.rolledBackAt = new Date().toISOString();
    await db.put(`deployment:${id}`, JSON.stringify(manifest));
    await dispatch('deployment.rolled_back', { id, model: manifest.model });
    return res.status(200).json({ success: true, manifest });
  }

  return res.status(404).json({ error: 'Unknown fleet endpoint.' });
}
