/**
 * Model Marketplace — browse & import community models
 * GET    /api/marketplace         — list all published models
 * POST   /api/marketplace         — publish a model to marketplace
 * GET    /api/marketplace?id=xxx  — single listing
 * POST   /api/marketplace/import  — import a marketplace model into your registry
 * DELETE /api/marketplace?id=xxx  — unpublish
 */
import { getDB } from './lib/kv.js';
import { logAudit } from './lib/audit.js';
import { dispatch } from './lib/notify.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  const db = getDB();

  if (req.method === 'GET') {
    const { id } = req.query;
    if (!id) {
      const { keys } = await db.list({ prefix: 'marketplace:' });
      const listings = (await Promise.all(keys.map(async ({ name }) => {
        const d = await db.get(name); return d ? JSON.parse(d) : null;
      }))).filter(Boolean).sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
      return res.status(200).json({ success: true, listings, total: listings.length });
    }
    const raw = await db.get(`marketplace:${id}`);
    if (!raw) return res.status(404).json({ error: 'Not found.' });
    return res.status(200).json({ success: true, listing: JSON.parse(raw) });
  }

  if (req.method === 'POST') {
    const { action, listingId } = req.body || {};

    // Import a marketplace model
    if (action === 'import' && listingId) {
      const raw = await db.get(`marketplace:${listingId}`);
      if (!raw) return res.status(404).json({ error: 'Listing not found.' });
      const listing = JSON.parse(raw);
      // Copy to local registry
      const { createHash } = await import('node:crypto');
      const newId = crypto.randomUUID();
      const record = {
        id: newId, model: listing.name, objectId: listing.shelbyObjectId,
        sha256: listing.sha256, size: listing.size, mode: listing.mode,
        source: `marketplace:${listingId}`, tags: ['marketplace', ...(listing.tags||[])],
        createdAt: new Date().toISOString(),
      };
      await db.put(`model:${newId}`, JSON.stringify(record));
      // Increment download count
      listing.downloads = (listing.downloads || 0) + 1;
      await db.put(`marketplace:${listingId}`, JSON.stringify(listing));
      await logAudit('marketplace.imported', { target: listingId, details: { name: listing.name } });
      return res.status(200).json({ success: true, modelId: newId, record });
    }

    // Publish a model
    const { modelId, description, tags, license } = req.body;
    if (!modelId) return res.status(400).json({ error: 'modelId required.' });
    const mRaw = await db.get(`model:${modelId}`);
    if (!mRaw) return res.status(404).json({ error: 'Model not found.' });
    const model = JSON.parse(mRaw);
    const id = crypto.randomUUID();
    const listing = {
      id, modelId, name: model.model, description: description || '',
      sha256: model.sha256, shelbyObjectId: model.objectId,
      size: model.size, mode: model.mode,
      tags: tags || model.tags || [], license: license || 'Apache-2.0',
      downloads: 0, publishedAt: new Date().toISOString(),
    };
    await db.put(`marketplace:${id}`, JSON.stringify(listing));
    await logAudit('marketplace.published', { target: id, details: { name: model.model } });
    await dispatch('model.published', { listingId: id, name: model.model });
    return res.status(201).json({ success: true, listing });
  }

  if (req.method === 'DELETE') {
    const { id } = req.query; if (!id) return res.status(400).json({ error: 'id required.' });
    await db.del(`marketplace:${id}`);
    await logAudit('marketplace.unpublished', { target: id });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}
