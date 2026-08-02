/**
 * A/B Test management
 * POST /api/abtest           — create test
 * GET  /api/abtest           — list all
 * GET  /api/abtest?id=xxx    — single test with results
 * POST /api/abtest/result    — device submits result
 * DELETE /api/abtest?id=xxx  — end test
 */
import { getDB } from './lib/kv.js';
import { dispatch } from './lib/notify.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const db = getDB();

  if (req.method === 'GET') {
    const { id } = req.query;
    if (!id) {
      const { keys } = await db.list({ prefix: 'abtest:' });
      const tests = (await Promise.all(keys.filter(k => !k.name.includes(':result:')).map(async ({ name }) => {
        const d = await db.get(name); return d ? JSON.parse(d) : null;
      }))).filter(Boolean).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return res.status(200).json({ success: true, tests });
    }
    const testData = await db.get(`abtest:${id}`);
    if (!testData) return res.status(404).json({ error: 'Not found.' });
    const test = JSON.parse(testData);
    // Aggregate results
    const { keys } = await db.list({ prefix: `abtest:${id}:result:` });
    const results = { a: { count: 0, totalLatency: 0, errors: 0 }, b: { count: 0, totalLatency: 0, errors: 0 } };
    for (const { name } of keys) {
      const r = JSON.parse(await db.get(name) || '{}');
      const bucket = r.modelId === test.modelAId ? 'a' : 'b';
      results[bucket].count++;
      results[bucket].totalLatency += r.latency || 0;
      if (!r.success) results[bucket].errors++;
    }
    for (const b of ['a', 'b']) {
      results[b].avgLatency = results[b].count ? Math.round(results[b].totalLatency / results[b].count) : 0;
      results[b].errorRate = results[b].count ? (results[b].errors / results[b].count * 100).toFixed(1) : '0.0';
    }
    return res.status(200).json({ success: true, test, results });
  }

  if (req.method === 'POST') {
    const { action, id, deviceId, modelId, latency, success } = req.body || {};
    if (action === 'result') {
      if (!id || !deviceId || !modelId) return res.status(400).json({ error: 'id, deviceId, modelId required.' });
      await db.put(`abtest:${id}:result:${deviceId}`, JSON.stringify({ deviceId, modelId, latency: latency || 0, success: success !== false, reportedAt: new Date().toISOString() }));
      return res.status(200).json({ success: true });
    }
    const { name, modelAId, modelBId, splitPercent, durationHours } = req.body || {};
    if (!name || !modelAId || !modelBId) return res.status(400).json({ error: 'name, modelAId, modelBId required.' });
    const testId = crypto.randomUUID();
    const test = { id: testId, name, modelAId, modelBId, splitPercent: splitPercent || 50, durationHours: durationHours || 24, status: 'running', createdAt: new Date().toISOString(), endsAt: new Date(Date.now() + (durationHours || 24) * 3600000).toISOString() };
    await db.put(`abtest:${testId}`, JSON.stringify(test));
    await dispatch('abtest.created', { id: testId, name });
    return res.status(201).json({ success: true, test });
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required.' });
    const raw = await db.get(`abtest:${id}`);
    if (!raw) return res.status(404).json({ error: 'Not found.' });
    const test = JSON.parse(raw);
    test.status = 'ended'; test.endedAt = new Date().toISOString();
    await db.put(`abtest:${id}`, JSON.stringify(test));
    await dispatch('abtest.ended', { id, name: test.name });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}
