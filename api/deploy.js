import { getDB } from './lib/kv.js';
import { shelbyUpload, makeBlobName } from './lib/shelby.js';
import { dispatch } from './lib/notify.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  const { modelId, modelName, version, region, canary, policy } = req.body || {};
  const db = getDB();

  let model = null;
  if (modelId) {
    const raw = await db.get(`model:${modelId}`);
    if (!raw) return res.status(404).json({ error: 'Unknown modelId.' });
    model = JSON.parse(raw);
  }

  const resolvedName = model?.model || modelName;
  const resolvedVersion = version || model?.version || 'latest';
  if (!resolvedName) return res.status(400).json({ error: 'modelName or modelId required.' });

  let sha256 = model?.sha256, shelbyObjectId = model?.objectId, deployMode = model?.mode || 'demo', warning;

  if (!sha256) {
    const { createHash } = await import('node:crypto');
    const seed = resolvedName + resolvedVersion + Date.now();
    sha256 = createHash('sha256').update(String(seed)).digest('hex');
    const blobName = makeBlobName(resolvedName, `-manifest-${Date.now()}`);
    const r = await shelbyUpload({ blobData: new TextEncoder().encode(seed), blobName, apiKey: process.env.SHELBY_API_KEY });
    shelbyObjectId = r.objectId; deployMode = r.mode; warning = r.warning;
  }

  // On-chain manifest — also upload the manifest itself as a Shelby object
  const id = crypto.randomUUID();
  const manifest = {
    id, model: resolvedName, version: resolvedVersion,
    region: region || 'Global',
    sha256, shelbyObjectId,
    commitment: '0x' + sha256.substring(0, 12),
    mode: deployMode, status: 'deploying', progress: 0,
    canary: canary ? { enabled: true, stages: [10, 25, 50, 100], currentStage: 0, policy: policy || { errorThreshold: 2, autoAdvance: true } } : null,
    modelId: modelId || null,
    createdAt: new Date().toISOString(),
  };

  // Upload manifest blob to Shelby for on-chain immutability
  const manifestBlob = new TextEncoder().encode(JSON.stringify(manifest));
  const mBlobName = `manifests/dep-${id.slice(0, 8)}`;
  const mResult = await shelbyUpload({ blobData: manifestBlob, blobName: mBlobName, apiKey: process.env.SHELBY_API_KEY });
  manifest.manifestObjectId = mResult.objectId;

  await db.put(`deployment:${id}`, JSON.stringify(manifest));
  await db.put(`devices:${id}`, JSON.stringify({ verified: 0, target: 248 }));

  await dispatch('deployment.started', { id, model: resolvedName, version: resolvedVersion, mode: deployMode });

  return res.status(200).json({ success: true, manifest, ...(warning && { warning }) });
}
