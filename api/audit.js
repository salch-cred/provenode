/**
 * GET /api/audit  — Immutable audit log
 * GET /api/audit?action=deployment.verified&from=2026-08-01&limit=50
 */
import { getAuditLog } from './lib/audit.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  const { action, from, to, limit = '100' } = req.query;
  const records = await getAuditLog({ action, from, to, limit: parseInt(limit) });
  return res.status(200).json({ success: true, records, count: records.length });
}
