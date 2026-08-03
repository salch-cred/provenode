/**
 * Webhook notification dispatcher
 * Reads registered webhooks from KV, fires matching events
 */
import { getDB } from './kv.js';

export async function dispatch(event, payload) {
  const db = getDB();
  const { keys } = await db.list({ prefix: 'webhook:' });
  const results = [];

  for (const { name } of keys) {
    const raw = await db.get(name);
    if (!raw) continue;
    const hook = JSON.parse(raw);
    if (!hook.enabled) continue;
    if (!hook.events.includes('*') && !hook.events.includes(event)) continue;

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
      const r = await fetch(hook.url, { method: 'POST', headers: hookHeaders, body, signal: AbortSignal.timeout(5000) });
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
