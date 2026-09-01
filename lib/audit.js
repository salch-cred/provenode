/**
 * Audit log helper — api/lib/audit.js
 * Every significant action is written to KV as an immutable audit record.
 *
 * SECURITY: records are written into the caller's tenant namespace. Passing the
 * tenant through means one tenant can never read another tenant's audit trail
 * (previously every record landed in one shared namespace that an
 * unauthenticated GET /api/audit could dump wholesale).
 */
import { getDB } from './kv.js';

export async function logAudit(action, { actor = 'system', target, details = {}, tenantId = '' } = {}) {
  try {
    const db = getDB(tenantId);
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

export async function getAuditLog({ limit = 100, action, from, to, tenantId = '' } = {}) {
  const db = getDB(tenantId);
  const { keys } = await db.list({ prefix: 'audit:' });
  const fromTs = from ? new Date(from).getTime() : 0;
  const toTs = to ? new Date(to).getTime() : Date.now();
  // Guard against ?limit=abc → NaN → slice(0, NaN) → zero records.
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 1000) : 100;

  // FIX: don't pre-slice — KV scan order is not guaranteed, so slicing
  // "the last N" could drop the newest records before the sort below.
  const records = (await Promise.all(
    keys.map(async ({ name }) => {
      const d = await db.get(name); if (!d) return null;
      const r = JSON.parse(d);
      const t = new Date(r.timestamp).getTime();
      if (t < fromTs || t > toTs) return null;
      if (action && r.action !== action) return null;
      return r;
    })
  )).filter(Boolean).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, safeLimit);

  return records;
}
