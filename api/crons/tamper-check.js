/** Vercel Cron — hourly — re-verify random Shelby objects against KV records */
import { getDB } from '../lib/kv.js';
import { dispatch } from '../lib/notify.js';
export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).end();
  const db = getDB();
  const { keys } = await db.list({ prefix: 'model:' });
  const shelbyKeys = [];
  for (const { name } of keys) {
    const d = await db.get(name); if (!d) continue;
    const m = JSON.parse(d);
    if (m.mode === 'shelby' && m.objectId?.startsWith('shelby://')) shelbyKeys.push(m);
  }
  // Sample up to 5 for hourly check
  const sample = shelbyKeys.sort(() => Math.random() - 0.5).slice(0, 5);
  const results = [];
  for (const m of sample) {
    try {
      // Verify object exists by checking the Shelby API
      const apiKey = process.env.SHELBY_API_KEY;
      if (!apiKey) { results.push({ id: m.id, status: 'skipped', reason: 'No API key' }); continue; }
      // HEAD request to confirm object accessibility
      const apiUrl = `https://api.shelbynet.shelby.xyz/v1`;
      const r = await fetch(`${apiUrl}/blobs/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ objectId: m.objectId }),
        signal: AbortSignal.timeout(8000),
      });
      results.push({ id: m.id, model: m.model, status: r.ok ? 'ok' : 'warn', httpStatus: r.status });
      if (!r.ok && r.status === 404) {
        m.tampered = true; m.tamperedAt = new Date().toISOString();
        await db.put(`model:${m.id}`, JSON.stringify(m));
        await dispatch('object.tampered', { id: m.id, model: m.model, objectId: m.objectId });
      }
    } catch (err) {
      results.push({ id: m.id, status: 'error', error: err.message });
    }
  }
  return res.status(200).json({ checked: sample.length, results, timestamp: new Date().toISOString() });
}
