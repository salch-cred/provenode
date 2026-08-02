/**
 * Email notifications endpoint
 * POST /api/notifications  — send a notification email
 * GET  /api/notifications/test  — send a test email
 */
import { sendEmail, deploymentVerifiedEmail, integrityMismatchEmail, expiryWarningEmail } from './lib/email.js';
import { getDB } from './lib/kv.js';

const ALERT_EMAIL = () => process.env.ALERT_EMAIL || '';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'GET') {
    const { type = 'test' } = req.query;
    const to = ALERT_EMAIL();
    if (!to) return res.status(400).json({ error: 'ALERT_EMAIL env var not set.' });

    const result = await sendEmail({
      to,
      subject: '✅ Provenode email test',
      html: '<h2>Provenode</h2><p>Your email notifications are working correctly.</p>',
    });
    return res.status(200).json({ success: true, result });
  }

  if (req.method === 'POST') {
    const { type, to, deployment, objects, deviceId, deploymentId, model } = req.body || {};
    const recipient = to || ALERT_EMAIL();
    if (!recipient) return res.status(400).json({ error: 'to address or ALERT_EMAIL required.' });

    let emailData;
    if (type === 'deployment_verified') emailData = deploymentVerifiedEmail(deployment || {});
    else if (type === 'integrity_mismatch') emailData = integrityMismatchEmail({ deviceId, deploymentId, model });
    else if (type === 'expiry_warning') emailData = expiryWarningEmail(objects || []);
    else return res.status(400).json({ error: 'Invalid type.' });

    const result = await sendEmail({ to: recipient, ...emailData });
    return res.status(200).json({ success: result.ok, result });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}
