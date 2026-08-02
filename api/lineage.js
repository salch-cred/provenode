/**
 * GET /api/lineage?modelId=xxx  — ancestors + descendants of a model
 * Returns a tree structure for the lineage graph
 */
import { getDB } from './lib/kv.js';

async function getModel(db, id) {
  const d = await db.get(`model:${id}`);
  return d ? JSON.parse(d) : null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

  const { modelId } = req.query;
  if (!modelId) return res.status(400).json({ error: 'modelId required.' });

  const db = getDB();
  const root = await getModel(db, modelId);
  if (!root) return res.status(404).json({ error: 'Model not found.' });

  // Walk ancestors
  const ancestors = [];
  let cursor = root;
  while (cursor?.parentId) {
    const parent = await getModel(db, cursor.parentId);
    if (!parent) break;
    ancestors.unshift({ id: parent.id, model: parent.model, sha256: parent.sha256, createdAt: parent.createdAt, mode: parent.mode });
    cursor = parent;
  }

  // Walk descendants (scan all lineage keys)
  const { keys } = await db.list({ prefix: 'lineage:' });
  const descendants = [];
  for (const { name } of keys) {
    const d = await db.get(name);
    if (!d) continue;
    const { parentId, childId } = JSON.parse(d);
    if (parentId === modelId) {
      const child = await getModel(db, childId);
      if (child) descendants.push({ id: child.id, model: child.model, sha256: child.sha256, createdAt: child.createdAt, mode: child.mode });
    }
  }

  return res.status(200).json({
    success: true,
    root: { id: root.id, model: root.model, sha256: root.sha256, createdAt: root.createdAt, mode: root.mode },
    ancestors,
    descendants,
    depth: ancestors.length,
  });
}
