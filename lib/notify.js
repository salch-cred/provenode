/**
 * Webhook notification dispatcher
 * Reads registered webhooks from KV, fires matching events.
 *
 * SECURITY / CORRECTNESS: webhooks are registered inside a tenant namespace, so
 * dispatch must read from the SAME namespace. Reading the global namespace
 * meant (a) tenant-registered webhooks never fired at all, and (b) a webhook
 * registered globally with `events: ['*']` received every tenant's payloads.
 */
import { getDB } from './kv.js';

/** Block SSRF targets: loopback, link-local, RFC1918, IPv6 local, metadata hosts. */
export function isBlockedWebhookUrl(rawUrl) {
  let u;
  try { u = new URL(rawUrl); } catch { return 'Invalid URL.'; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'Only http(s) URLs are allowed.';

  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  // Obvious names
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) return 'Private hosts are not allowed.';
  // Cloud metadata endpoints
  if (host === '169.254.169.254' || host === 'metadata.google.internal' || host === 'metadata') return 'Metadata endpoints are not allowed.';
  // IPv6 loopback / link-local / unique-local
  if (host === '::1' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) return 'Private IPv6 ranges are not allowed.';
  // IPv4-mapped IPv6
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(host);
  const candidate = mapped ? mapped[1] : host;

  // Decimal / octal / hex integer literals (http://2130706433 == 127.0.0.1)
  if (/^\d+$/.test(candidate) || /^0x[0-9a-f]+$/i.test(candidate)) return 'Numeric IP literals are not allowed.';

  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(candidate);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 127) return 'Loopback addresses are not allowed.';
    if (a === 10) return 'Private ranges are not allowed.';
    if (a === 169 && b === 254) return 'Link-local addresses are not allowed.';
    if (a === 192 && b === 168) return 'Private ranges are not allowed.';
    if (a === 172 && b >= 16 && b <= 31) return 'Private ranges are not allowed.';
    if (a >= 224) return 'Multicast/reserved addresses are not allowed.';
  }
  return null; // allowed
}

export async function dispatch(event, payload, tenantId = '') {
  const db = getDB(tenantId);
  const { keys } = await db.list({ prefix: 'webhook:' });
  const results = [];

  for (const { name } of keys) {
    const raw = await db.get(name);
    if (!raw) continue;
    const hook = JSON.parse(raw);
    if (!hook.enabled) continue;
    if (!hook.events.includes('*') && !hook.events.includes(event)) continue;
    // Re-check at dispatch time: a URL could have been registered before the
    // blocklist existed, or DNS could have been re-pointed since.
    if (isBlockedWebhookUrl(hook.url)) {
      results.push({ id: hook.id, url: hook.url, error: 'blocked_target' });
      continue;
    }

    const body = JSON.stringify({ event, timestamp: new Date().toISOString(), payload });
    const hookHeaders = {
      'Content-Type': 'application/json',
      'User-Agent': 'Provenode/2.0',
    };
    if (hook.secret) {
      const { createHmac } = await import('node:crypto');
      hookHeaders['X-Provenode-Signature'] = 'sha256=' + createHmac('sha256', hook.secret).update(body).digest('hex');
    }

    try {
      const r = await fetch(hook.url, { method: 'POST', headers: hookHeaders, body, redirect: 'error', signal: AbortSignal.timeout(5000) });
      results.push({ id: hook.id, url: hook.url, status: r.status, ok: r.ok });

      // Update last-fired
      hook.lastFiredAt = new Date().toISOString();
      hook.lastStatus = r.status;
      await db.put(name, JSON.stringify(hook));
    } catch (err) {
      results.push({ id: hook.id, url: hook.url, error: err.message });
    }
  }
  return results;
}
