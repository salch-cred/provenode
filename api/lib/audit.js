/**
 * Audit log helper — api/lib/audit.js
 * Every significant action is written to KV as an immutable audit record.
 */
import { getDB } from './kv.js';

export async function logAudit(action, { actor = 'system', target, details = {} } = {}) {
  try {
    const db = getDB();
    const ts = Date.now();
    const id = `${ts}-${Math.random().toString(36).slice(2, 8)}`;
    const record = {
      id, action, actor, target,
      details, timestamp: new Date(ts).toISOString(),
    };
    await db.put(`audit:${ts}:${id}`, JSON.stringify(record));
    return record;
  } catch { /* audit must never crash the caller */ }
}

export async function getAuditLog({ limit = 100, action, from, to } = {}) {
  const db = getDB();
  const { keys } = await db.list({ prefix: 'audit:' });
  const fromTs = from ? new Date(from).getTime() : 0;
  const toTs = to ? new Date(to).getTime() : Date.now();

  const records = (await Promise.all(
    keys.slice(-limit * 2).map(async ({ name }) => {
      const d = await db.get(name); if (!d) return null;
      const r = JSON.parse(d);
      const t = new Date(r.timestamp).getTime();
      if (t < fromTs || t > toTs) return null;
      if (action && r.action !== action) return null;
      return r;
    })
  )).filter(Boolean).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, limit);

  return records;
}
