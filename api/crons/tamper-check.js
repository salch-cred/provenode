/** Vercel Cron — hourly — verify sample of Shelby objects */
import { timingSafeEqual } from 'node:crypto';
import { getDB } from '../lib/kv.js';
import { dispatch } from '../lib/notify.js';
import { sendEmail, integrityMismatchEmail } from '../lib/email.js';

export default async function handler(req, res) {
  // SECURITY: fail CLOSED. Without a secret anyone could trigger this endpoint
  // (it sends real email and mutates model records). Vercel Cron always sends
  // the Authorization header, so a missing CRON_SECRET is a misconfiguration.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return res.status(503).end('CRON_SECRET not configured.');
  const expected = `Bearer ${cronSecret}`;
  const got = String(req.headers.authorization || '');
  const a = Buffer.from(got, 'utf8'), b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return res.status(401).end('Unauthorized');

  const db = getDB();
  const { keys } = await db.list({ prefix: 'model:' });
  const shelbyModels = [];

  for (const { name } of keys) {
    const d = await db.get(name); if (!d) continue;
    const m = JSON.parse(d);
    if (m.mode === 'shelby' && m.address) shelbyModels.push(m);
  }

  // FIX M-2: Round-robin cursor instead of random sample for full coverage
  const cursorKey = 'cron:tamper-check:cursor';
  const rawCursor = await db.get(cursorKey);
  const parsedCursor = rawCursor ? parseInt(rawCursor, 10) : 0;
  const cursor = Number.isFinite(parsedCursor) && parsedCursor >= 0 ? parsedCursor : 0;
  const batchSize = 5;
  const start = cursor % Math.max(shelbyModels.length, 1);
  const sample = [...shelbyModels.slice(start, start + batchSize),
                  ...shelbyModels.slice(0, Math.max(0, start + batchSize - shelbyModels.length))];
  await db.put(cursorKey, String(start + batchSize));
  const results = [];
  const apiKey = process.env.SHELBY_API_KEY;

  for (const m of sample) {
    try {
      if (!apiKey) { results.push({ id: m.id, status: 'skipped' }); continue; }
      const r = await fetch(`https://api.shelbynet.shelby.xyz/v1/accounts/${m.address}/resources`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(8000),
      });
      results.push({ id: m.id, model: m.model, status: r.ok ? 'ok' : 'warn', httpStatus: r.status });
      if (r.status === 404) {
        m.tampered = true; m.tamperedAt = new Date().toISOString();
        await db.put(`model:${m.id}`, JSON.stringify(m));
        await dispatch('object.tampered', { id: m.id, model: m.model, objectId: m.objectId });
        if (process.env.ALERT_EMAIL) {
          await sendEmail({
            to: process.env.ALERT_EMAIL,
            subject: `🚨 Shelby object tampered — ${m.model}`,
            html: `<h2>Tamper Detected</h2><p>Model <strong>${m.model}</strong> object is unreachable on Shelbynet.</p><p>ObjectId: <code>${m.objectId}</code></p>`,
          });
        }
      }
    } catch (err) {
      results.push({ id: m.id, status: 'error', error: err.message });
    }
  }
  return res.status(200).json({ checked: sample.length, results, timestamp: new Date().toISOString() });
}
