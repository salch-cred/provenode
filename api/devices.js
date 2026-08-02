/**
 * Device Registry
 * POST   /api/devices/register  — register device
 * GET    /api/devices            — list all
 * GET    /api/devices?id=xxx     — single device
 * PATCH  /api/devices            — update device (body: {id, ...fields})
 * DELETE /api/devices?id=xxx     — deregister
 */
import { getDB } from './lib/kv.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  const db = getDB();

  if (req.method === 'GET') {
    const { id } = req.query;
    if (id) {
      const raw = await db.get(`device:${id}`); if (!raw) return res.status(404).json({ error: 'Not found.' });
      return res.status(200).json({ success: true, device: JSON.parse(raw) });
    }
    const { keys } = await db.list({ prefix: 'device:' });
    const devices = (await Promise.all(keys.map(async ({ name }) => {
      const d = await db.get(name); return d ? JSON.parse(d) : null;
    }))).filter(Boolean).sort((a, b) => new Date(b.registeredAt) - new Date(a.registeredAt));
    return res.status(200).json({ success: true, devices, total: devices.length });
  }

  if (req.method === 'POST') {
    const { deviceId, type, arch, location, publicKey, fleet } = req.body || {};
    if (!deviceId) return res.status(400).json({ error: 'deviceId required.' });
    const existing = await db.get(`device:${deviceId}`);
    const device = {
      ...(existing ? JSON.parse(existing) : {}),
      id: deviceId, type: type || 'unknown', arch: arch || 'arm64',
      location: location || 'Unknown', publicKey: publicKey || null,
      fleet: fleet || 'default', status: 'online',
      registeredAt: existing ? JSON.parse(existing).registeredAt : new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      currentModelId: null, currentModelHash: null,
    };
    await db.put(`device:${deviceId}`, JSON.stringify(device));
    return res.status(201).json({ success: true, device });
  }

  if (req.method === 'PATCH') {
    const { id, ...updates } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required.' });
    const raw = await db.get(`device:${id}`); if (!raw) return res.status(404).json({ error: 'Not found.' });
    const device = { ...JSON.parse(raw), ...updates, lastSeenAt: new Date().toISOString() };
    await db.put(`device:${id}`, JSON.stringify(device));
    return res.status(200).json({ success: true, device });
  }

  if (req.method === 'DELETE') {
    const { id } = req.query; if (!id) return res.status(400).json({ error: 'id required.' });
    await db.del(`device:${id}`);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}
