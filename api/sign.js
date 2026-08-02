/**
 * GET /api/sign?modelId=xxx  — get the org signature for a model
 * POST /api/sign             — sign a model's SHA-256 with org key
 */
import { signModel } from './lib/sign.js';
import { getDB } from './lib/kv.js';
import { logAudit } from './lib/audit.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const db = getDB();

  if (req.method === 'GET') {
    const { modelId } = req.query;
    if (!modelId) return res.status(400).json({ error: 'modelId required.' });
    const raw = await db.get(`model:${modelId}`);
    if (!raw) return res.status(404).json({ error: 'Model not found.' });
    const model = JSON.parse(raw);
    if (!model.signature) return res.status(200).json({ signed: false, modelId, sha256: model.sha256 });
    return res.status(200).json({ signed: true, modelId, sha256: model.sha256, signature: model.signature });
  }

  if (req.method === 'POST') {
    const { modelId } = req.body || {};
    if (!modelId) return res.status(400).json({ error: 'modelId required.' });
    const raw = await db.get(`model:${modelId}`);
    if (!raw) return res.status(404).json({ error: 'Model not found.' });
    const model = JSON.parse(raw);

    const sig = await signModel(model.sha256);
    if (!sig) return res.status(400).json({ error: 'SIGN_KEY or SHELBY_PRIVATE_KEY not configured.' });

    model.signature = sig;
    await db.put(`model:${modelId}`, JSON.stringify(model));
    await logAudit('model.signed', { target: modelId, details: { sha256: model.sha256.slice(0,12) } });

    return res.status(200).json({ success: true, modelId, signature: sig });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}
