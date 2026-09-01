/** Vercel Cron — daily 06:00 UTC — find expiring Shelby objects */
import { timingSafeEqual } from 'node:crypto';
import { getDB } from '../lib/kv.js';
import { dispatch } from '../lib/notify.js';
import { sendEmail, expiryWarningEmail } from '../lib/email.js';

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
  const now = Date.now();
  const expiring = [];

  for (const { name } of keys) {
    const d = await db.get(name); if (!d) continue;
    const m = JSON.parse(d);
    if (m.mode !== 'shelby' || !m.expiresAt) continue;
    const daysLeft = Math.floor((new Date(m.expiresAt).getTime() - now) / 86400000);
    if (daysLeft <= 7) expiring.push({ id: m.id, model: m.model, objectId: m.objectId, daysLeft });
  }

  if (expiring.length) {
    await dispatch('object.expiring_soon', { count: expiring.length, objects: expiring });
    if (process.env.ALERT_EMAIL) {
      await sendEmail({ to: process.env.ALERT_EMAIL, ...expiryWarningEmail(expiring) });
    }
  }

  return res.status(200).json({ checked: keys.length, expiring: expiring.length, objects: expiring });
}
