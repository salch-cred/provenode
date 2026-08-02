/**
 * Email notifications via Resend — api/lib/email.js
 */

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

export function deploymentVerifiedEmail(deployment) {
  return {
    subject: `✅ Deployment verified — ${deployment.model} v${deployment.version}`,
    html: `<h2>Deployment Complete</h2><p><strong>${deployment.model}</strong> v${deployment.version} has been verified across all ${deployment.devices || 248} devices.</p><p>SHA-256: <code>${deployment.sha256}</code></p><p>Mode: ${deployment.mode}</p><p><a href="${process.env.VERCEL_URL ? 'https://'+process.env.VERCEL_URL : ''}/app.html">View in console</a></p>`,
  };
}

export function integrityMismatchEmail({ deviceId, deploymentId, model }) {
  return {
    subject: `🚨 Integrity mismatch — ${deviceId}`,
    html: `<h2 style="color:red">Integrity Mismatch Detected</h2><p>Device <strong>${deviceId}</strong> reported a SHA-256 mismatch for deployment <code>${deploymentId}</code>.</p><p>Model: ${model}</p><p>The device has been flagged. Investigate immediately.</p>`,
  };
}

export function expiryWarningEmail(objects) {
  return {
    subject: `⚠️ ${objects.length} Shelby object(s) expiring soon`,
    html: `<h2>Shelby Object Expiry Warning</h2><p>${objects.length} model(s) are expiring within 7 days:</p><ul>${objects.map(o => `<li><strong>${o.model}</strong> — ${o.daysLeft} day(s) left</li>`).join('')}</ul><p><a href="${process.env.VERCEL_URL ? 'https://'+process.env.VERCEL_URL : ''}/app.html">Renew in console</a></p>`,
  };
}
