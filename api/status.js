/**
 * GET  /api/status?id=<deploymentId>  — single deployment
 * GET  /api/status                    — all deployments (dashboard list)
 * POST /api/status                    — update device-verified count
 *
 * POST body: { id: string, status: 'verified', count: number }
 */

import { getDB } from './lib/kv.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const db = getDB();

  // ── GET ──────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const id = req.query?.id;

    if (!id) {
      // List all deployments
      const { keys } = await db.list({ prefix: 'deployment:' });
      const deployments = await Promise.all(
        keys.map(async ({ name }) => {
          const data = await db.get(name);
          return data ? JSON.parse(data) : null;
        })
      );
      return res.status(200).json({
        success: true,
        deployments: deployments
          .filter(Boolean)
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
      });
    }

    // Single deployment
    const [manifestData, devicesData] = await Promise.all([
      db.get(`deployment:${id}`),
      db.get(`devices:${id}`),
    ]);

    if (!manifestData) {
      return res.status(404).json({ success: false, error: 'Not found.' });
    }

    const manifest = JSON.parse(manifestData);
    const devices = devicesData ? JSON.parse(devicesData) : { verified: 0, target: 248 };

    manifest.progress = Math.min(100, Math.round((devices.verified / devices.target) * 100));
    if (manifest.progress === 100) manifest.status = 'verified';

    return res.status(200).json({ success: true, manifest, devices });
  }

  // ── POST ─────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    try {
      const { id, status, count } = req.body || {};

      if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: 'id is required.' });
      }

      if (status === 'verified') {
        const devicesData = await db.get(`devices:${id}`);
        if (devicesData) {
          const devices = JSON.parse(devicesData);
          const delta = Number.isFinite(count) && count > 0 ? count : 1;
          devices.verified = Math.min(devices.target, devices.verified + delta);
          await db.put(`devices:${id}`, JSON.stringify(devices));
        }
      }

      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}
