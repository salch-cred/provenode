/**
 * POST /api/upload
 *
 * Accepts a multipart form with a `file` (binary) and optional `name`.
 * 1. Validates file size (≤ 100 MB) and MIME type.
 * 2. Computes SHA-256 in Node.js.
 * 3. Attempts a real Shelby shelbynet upload when SHELBY_API_KEY is set;
 *    gracefully falls back to demo mode on any failure.
 * 4. Persists the record in Vercel KV (PROVENODE_DB env var = KV URL).
 *
 * Response (200):
 *   { success, id, objectId, hash, size, mode, warning? }
 */

import { createHash } from 'node:crypto';
import formidable from 'formidable';
import { Readable } from 'node:stream';
import { getDB } from './lib/kv.js';
import { shelbyUpload, makeBlobName } from './lib/shelby.js';

// Max upload size: 100 MB
const MAX_BYTES = 100 * 1024 * 1024;

// Allowed MIME types — extend as needed
const ALLOWED_TYPES = new Set([
  'application/octet-stream',
  'application/zip',
  'application/x-tar',
  'application/gzip',
  'application/x-gzip',
  'model/gltf-binary',
  'text/plain',
  'application/json',
]);

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  // CORS pre-flight
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const form = formidable({ maxFileSize: MAX_BYTES, keepExtensions: true });

    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, f, v) => (err ? reject(err) : resolve([f, v])));
    });

    const uploadedFile = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!uploadedFile) {
      return res.status(400).json({ error: 'No file provided.' });
    }

    const rawName = Array.isArray(fields.name) ? fields.name[0] : fields.name;
    const modelName = (rawName || uploadedFile.originalFilename || 'unnamed-model')
      .toString()
      .slice(0, 120);

    // Validate MIME (be lenient — fall back to octet-stream if unknown)
    const mime = uploadedFile.mimetype || 'application/octet-stream';
    if (!ALLOWED_TYPES.has(mime) && !mime.startsWith('application/') && !mime.startsWith('model/')) {
      return res.status(415).json({ error: `Unsupported file type: ${mime}` });
    }

    // Read the temp file into a Buffer
    const { readFile } = await import('node:fs/promises');
    const bytes = await readFile(uploadedFile.filepath);

    if (bytes.length === 0) {
      return res.status(400).json({ error: 'Uploaded file is empty.' });
    }

    // SHA-256 (Node.js crypto — no Web Crypto API quirks)
    const sha256 = createHash('sha256').update(bytes).digest('hex');

    const id = crypto.randomUUID();
    const slug = modelName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'model';
    const blobName = makeBlobName(slug, `-${id.slice(0, 8)}`);

    const { objectId, mode, warning } = await shelbyUpload({
      blobData: new Uint8Array(bytes),
      blobName,
      apiKey: process.env.SHELBY_API_KEY,
    });

    const record = {
      id,
      model: modelName,
      objectId,
      sha256,
      size: bytes.length,
      mode,
      createdAt: new Date().toISOString(),
    };

    const db = getDB();
    await db.put(`model:${id}`, JSON.stringify(record));

    return res.status(200).json({
      success: true,
      id,
      objectId,
      hash: sha256,
      size: bytes.length,
      mode,
      ...(warning && { warning }),
    });
  } catch (err) {
    console.error('[upload] error:', err);
    const status = err.httpCode === 413 ? 413 : 500;
    return res.status(status).json({ error: err.message || 'Upload failed.' });
  }
}
