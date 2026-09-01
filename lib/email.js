/**
 * Email notifications via Resend — api/lib/email.js
 *
 * SECURITY: every interpolated value in these templates is user- or
 * device-controlled (model names, device ids from URL paths). They are escaped
 * so a crafted name cannot inject markup into an operator's inbox.
 */

/** Escape a value for safe interpolation into HTML email bodies. */
const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export async function sendEmail({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { skipped: true, reason: 'RESEND_API_KEY not configured' };

  const from = process.env.EMAIL_FROM || 'Provenode <noreply@provenode.app>';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, html, text }),
  });

  const data = await res.json();
  return { ok: res.ok, id: data.id, error: data.message };
}

const consoleUrl = () => `${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : ''}/app/dashboard`;

export function deploymentVerifiedEmail(deployment) {
  return {
    subject: `Deployment verified — ${String(deployment.model ?? '')} v${String(deployment.version ?? '')}`,
    html: `<h2>Deployment Complete</h2><p><strong>${esc(deployment.model)}</strong> v${esc(deployment.version)} has been verified across all ${esc(deployment.devices || 248)} devices.</p><p>SHA-256: <code>${esc(deployment.sha256)}</code></p><p>Mode: ${esc(deployment.mode)}</p><p><a href="${consoleUrl()}">View in console</a></p>`,
  };
}

export function integrityMismatchEmail({ deviceId, deploymentId, model }) {
  return {
    subject: `Integrity mismatch — ${String(deviceId ?? '')}`,
    html: `<h2 style="color:#c43d3d">Integrity Mismatch Detected</h2><p>Device <strong>${esc(deviceId)}</strong> reported a SHA-256 mismatch for deployment <code>${esc(deploymentId)}</code>.</p><p>Model: ${esc(model)}</p><p>The device has been flagged. Investigate immediately.</p>`,
  };
}

export function expiryWarningEmail(objects) {
  const list = Array.isArray(objects) ? objects : [];
  return {
    subject: `${list.length} Shelby object(s) expiring soon`,
    html: `<h2>Shelby Object Expiry Warning</h2><p>${list.length} model(s) are expiring within 7 days:</p><ul>${list.map(o => `<li><strong>${esc(o.model)}</strong> — ${esc(o.daysLeft)} day(s) left</li>`).join('')}</ul><p><a href="${consoleUrl()}">Renew in console</a></p>`,
  };
}
