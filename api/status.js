import { getDB } from './lib/kv.js';
import { dispatch } from './lib/notify.js';
export default async function handler(req, res) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  const db = getDB();
  if (req.method === 'GET') {
    const id = req.query?.id;
    if (!id) {
      const { keys } = await db.list({ prefix: 'deployment:' });
      const deployments = (await Promise.all(keys.map(async ({name}) => {
        const d = await db.get(name); return d ? JSON.parse(d) : null;
      }))).filter(Boolean).sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt));
      return res.status(200).json({ success: true, deployments });
    }
    const [md, dd] = await Promise.all([db.get(`deployment:${id}`), db.get(`devices:${id}`)]);
    if (!md) return res.status(404).json({ success: false, error: 'Not found.' });
    const manifest = JSON.parse(md);
    const devices = dd ? JSON.parse(dd) : { verified: 0, target: 248 };
    manifest.progress = Math.min(100, Math.round((devices.verified / devices.target) * 100));
    if (manifest.progress >= 100 && manifest.status !== 'verified') {
      manifest.status = 'verified';
      await db.put(`deployment:${id}`, JSON.stringify(manifest));
      await dispatch('deployment.verified', { id, model: manifest.model });
    }
    return res.status(200).json({ success: true, manifest, devices });
  }
  if (req.method === 'POST') {
    const { id, status, count } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required.' });
    if (status === 'verified') {
      const dd = await db.get(`devices:${id}`);
      if (dd) {
        const devices = JSON.parse(dd);
        devices.verified = Math.min(devices.target, devices.verified + (Number.isFinite(count) && count > 0 ? count : 1));
        await db.put(`devices:${id}`, JSON.stringify(devices));
      }
    }
    return res.status(200).json({ success: true });
  }
  return res.status(405).json({ error: 'Method not allowed.' });
}
