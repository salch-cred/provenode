/** Vercel Cron — daily 06:00 UTC — find expiring Shelby objects */
import { getDB } from '../lib/kv.js';
import { dispatch } from '../lib/notify.js';
import { sendEmail, expiryWarningEmail } from '../lib/email.js';

export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) return res.status(401).end('Unauthorized');

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
