/**
 * POST /api/deploy
 *
 * Creates a deployment manifest, optionally reusing an already-uploaded model.
 *
 * Body (JSON):
 *   { modelId?, modelName?, version?, region? }
 *
 * If modelId is provided the sha256/objectId from the prior /api/upload record
 * are reused verbatim — the deployment always traces back to the real artifact.
 *
 * Response (200):
 *   { success, manifest, warning? }
 */

import { getDB } from './lib/kv.js';
import { shelbyUpload, makeBlobName } from './lib/shelby.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  let data;
  try {
    data = req.body;
    if (!data || typeof data !== 'object') throw new Error('invalid body');
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body.' });
  }

  const { modelId, modelName, version, region } = data;

  const db = getDB();
  let model = null;

  if (modelId) {
    const raw = await db.get(`model:${modelId}`);
    if (!raw) {
      return res.status(404).json({ error: 'Unknown modelId.' });
    }
    model = JSON.parse(raw);
  }

  const resolvedName = model?.model || modelName;
  const resolvedVersion = version || model?.version || 'latest';

  if (!resolvedName) {
    return res.status(400).json({ error: 'modelName or modelId is required.' });
  }

  let sha256 = model?.sha256;
  let shelbyObjectId = model?.objectId;
  let mode = model?.mode || 'demo';
  let warning;

  // No pre-registered model — synthesise a lightweight manifest blob
  if (!sha256) {
    const { createHash } = await import('node:crypto');
    const seed = resolvedName + resolvedVersion + Date.now().toString();
    sha256 = createHash('sha256').update(seed).digest('hex');

    const slug = resolvedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'model';
    const blobName = makeBlobName(slug, `-${resolvedVersion}-${Date.now()}`);
    const blobData = new TextEncoder().encode(seed);

    const result = await shelbyUpload({
      blobData,
      blobName,
      apiKey: process.env.SHELBY_API_KEY,
    });

    shelbyObjectId = result.objectId;
    mode = result.mode;
    warning = result.warning;
  }

  const manifest = {
    id: crypto.randomUUID(),
    model: resolvedName,
    version: resolvedVersion,
    region: region || 'Global',
    sha256,
    shelbyObjectId,
    commitment: '0x' + sha256.substring(0, 12),
    mode,
    status: 'deploying',
    progress: 0,
    createdAt: new Date().toISOString(),
  };

  await db.put(`deployment:${manifest.id}`, JSON.stringify(manifest));
  await db.put(`devices:${manifest.id}`, JSON.stringify({ verified: 0, target: 248 }));

  return res.status(200).json({
    success: true,
    manifest,
    ...(warning && { warning }),
  });
}
