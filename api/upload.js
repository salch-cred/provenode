import { createHash } from 'node:crypto';
import formidable from 'formidable';
import { getDB } from './lib/kv.js';
import { shelbyUpload, makeBlobName } from './lib/shelby.js';
import { dispatch } from './lib/notify.js';
export const config = { api: { bodyParser: false } };
const MAX_BYTES = 100 * 1024 * 1024;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  const form = formidable({ maxFileSize: MAX_BYTES, keepExtensions: true });
  const [fields, files] = await new Promise((resolve, reject) =>
    form.parse(req, (err, f, v) => err ? reject(err) : resolve([f, v]))
  );

  const uploaded = Array.isArray(files.file) ? files.file[0] : files.file;
  if (!uploaded) return res.status(400).json({ error: 'No file provided.' });

  const rawName = Array.isArray(fields.name) ? fields.name[0] : fields.name;
  const modelName = (rawName || uploaded.originalFilename || 'unnamed').toString().slice(0, 120);
  const parentId = Array.isArray(fields.parentId) ? fields.parentId[0] : fields.parentId;
  const tags = Array.isArray(fields.tags) ? fields.tags[0] : fields.tags;

  const { readFile } = await import('node:fs/promises');
  const bytes = await readFile(uploaded.filepath);
  if (!bytes.length) return res.status(400).json({ error: 'File is empty.' });
  if (bytes.length > MAX_BYTES) return res.status(413).json({ error: 'File too large (max 100 MB).' });

  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const id = crypto.randomUUID();
  const slug = modelName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'model';
  const blobName = makeBlobName(slug, `-${id.slice(0, 8)}`);

  const { objectId, mode, warning, address, expiresAt } = await shelbyUpload({
    blobData: new Uint8Array(bytes),
    blobName,
    apiKey: process.env.SHELBY_API_KEY,
  });

  const record = {
    id, model: modelName, objectId, sha256,
    size: bytes.length, mode, address, expiresAt,
    parentId: parentId || null,
    tags: tags ? tags.split(',').map(t => t.trim()) : [],
    createdAt: new Date().toISOString(),
  };

  const db = getDB();
  await db.put(`model:${id}`, JSON.stringify(record));
  if (parentId) await db.put(`lineage:${id}`, JSON.stringify({ parentId, childId: id }));

  await dispatch('model.registered', { id, model: modelName, mode, sha256: sha256.slice(0, 12) });

  return res.status(200).json({ success: true, id, objectId, hash: sha256, size: bytes.length, mode, expiresAt, ...(warning && { warning }) });
}
