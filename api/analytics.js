/**
 * Device Analytics — time-series metrics per device
 * GET /api/analytics?deviceId=xxx&metric=latency&days=7
 * POST /api/analytics  — device submits a metric reading
 */
import { getDB } from './lib/kv.js';

const VALID_METRICS = ['latency','error_rate','accuracy','temperature','memory','uptime'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  const db = getDB();

  if (req.method === 'GET') {
    const { deviceId, metric = 'latency', days = '7' } = req.query;
    const since = Date.now() - parseInt(days) * 86400000;

    if (!deviceId) {
      // Fleet-wide summary
      const { keys } = await db.list({ prefix: 'device:' });
      const devices = (await Promise.all(keys.map(async ({ name }) => {
        const d = await db.get(name); return d ? JSON.parse(d) : null;
      }))).filter(Boolean);

      const summary = {
        total: devices.length,
        online: devices.filter(d => d.status === 'online').length,
        byType: {},
        byLocation: {},
        byFleet: {},
      };

      for (const d of devices) {
        summary.byType[d.type] = (summary.byType[d.type] || 0) + 1;
        summary.byLocation[d.location] = (summary.byLocation[d.location] || 0) + 1;
        summary.byFleet[d.fleet] = (summary.byFleet[d.fleet] || 0) + 1;
      }

      return res.status(200).json({ success: true, summary });
    }

    // Per-device time series
    const prefix = `analytics:${deviceId}:${metric}:`;
    const { keys } = await db.list({ prefix });
    const points = (await Promise.all(keys.map(async ({ name }) => {
      const ts = parseInt(name.split(':').pop());
      if (ts < since) return null;
      const d = await db.get(name);
      return d ? { timestamp: new Date(ts).toISOString(), value: parseFloat(d) } : null;
    }))).filter(Boolean).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const values = points.map(p => p.value).filter(v => !isNaN(v));
    const stats = values.length ? {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: (values.reduce((a,b) => a+b, 0) / values.length).toFixed(2),
      p95: values.sort((a,b)=>a-b)[Math.floor(values.length * 0.95)] || 0,
    } : null;

    return res.status(200).json({ success: true, deviceId, metric, points, stats, days: parseInt(days) });
  }

  if (req.method === 'POST') {
    const { deviceId, metric, value } = req.body || {};
    if (!deviceId || !metric) return res.status(400).json({ error: 'deviceId and metric required.' });
    if (!VALID_METRICS.includes(metric)) return res.status(400).json({ error: `Invalid metric. Use: ${VALID_METRICS.join(', ')}` });

    const ts = Date.now();
    await db.put(`analytics:${deviceId}:${metric}:${ts}`, String(value));

    // Update device last seen
    const raw = await db.get(`device:${deviceId}`);
    if (raw) {
      const d = JSON.parse(raw);
      d.lastSeenAt = new Date().toISOString();
      d[`last_${metric}`] = value;
      await db.put(`device:${deviceId}`, JSON.stringify(d));
    }

    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}
