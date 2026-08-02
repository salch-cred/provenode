/**
 * POST /api/import  — import model from HuggingFace Hub → SHA-256 → Shelby
 * Body: { source: 'huggingface', repo: 'ultralytics/yolov8n', filename: 'yolov8n.onnx', name?: string }
 * GET  /api/import?jobId=xxx — check job status
 */
import { createHash } from 'node:crypto';
import { getDB } from './lib/kv.js';
import { shelbyUpload, makeBlobName } from './lib/shelby.js';
import { dispatch } from './lib/notify.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const db = getDB();

  if (req.method === 'GET') {
    const { jobId } = req.query;
    if (!jobId) {
      const { keys } = await db.list({ prefix: 'import:' });
      const jobs = (await Promise.all(keys.map(async ({ name }) => {
        const d = await db.get(name); return d ? JSON.parse(d) : null;
      }))).filter(Boolean).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return res.status(200).json({ success: true, jobs });
    }
    const raw = await db.get(`import:${jobId}`);
    if (!raw) return res.status(404).json({ error: 'Job not found.' });
    return res.status(200).json({ success: true, job: JSON.parse(raw) });
  }

  if (req.method === 'POST') {
    const { source, repo, filename, name, revision } = req.body || {};
    if (source !== 'huggingface') return res.status(400).json({ error: 'Only source "huggingface" is supported.' });
    if (!repo || !filename) return res.status(400).json({ error: 'repo and filename required.' });

    const jobId = crypto.randomUUID();
    const job = { id: jobId, source, repo, filename, name: name || `${repo.split('/')[1]}/${filename}`, status: 'fetching', createdAt: new Date().toISOString() };
    await db.put(`import:${jobId}`, JSON.stringify(job));

    // Async-style execution within the same request (Vercel allows 30s)
    try {
      const rev = revision || 'main';
      const url = `https://huggingface.co/${repo}/resolve/${rev}/${filename}`;
      const r = await fetch(url, { headers: { 'User-Agent': 'Provenode/2.0' } });
      if (!r.ok) throw new Error(`HuggingFace returned ${r.status}: ${r.statusText}`);

      const buf = Buffer.from(await r.arrayBuffer());
      const sha256 = createHash('sha256').update(buf).digest('hex');
      const id = crypto.randomUUID();
      const slug = job.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const blobName = makeBlobName(slug, `-${id.slice(0, 8)}`);

      const { objectId, mode, warning } = await shelbyUpload({
        blobData: new Uint8Array(buf),
        blobName,
        apiKey: process.env.SHELBY_API_KEY,
      });

      const record = { id, model: job.name, objectId, sha256, size: buf.length, mode, source: `hf:${repo}/${filename}`, tags: ['huggingface', repo.split('/')[0]], createdAt: new Date().toISOString() };
      await db.put(`model:${id}`, JSON.stringify(record));
      job.status = 'complete'; job.modelId = id; job.sha256 = sha256; job.size = buf.length; job.mode = mode; job.completedAt = new Date().toISOString();
      await db.put(`import:${jobId}`, JSON.stringify(job));

      await dispatch('model.imported', { jobId, modelId: id, repo, filename, sha256: sha256.slice(0, 12), mode });
      return res.status(200).json({ success: true, job, modelId: id, hash: sha256, size: buf.length, mode, ...(warning && { warning }) });

    } catch (err) {
      job.status = 'failed'; job.error = err.message; job.failedAt = new Date().toISOString();
      await db.put(`import:${jobId}`, JSON.stringify(job));
      return res.status(500).json({ success: false, error: err.message, jobId });
    }
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}
