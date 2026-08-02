import { getDB } from './lib/kv.js';
const PUBLIC = ['id','model','objectId','sha256','size','mode','address','expiresAt','parentId','tags','createdAt'];
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  const db = getDB();
  const { keys } = await db.list({ prefix: 'model:' });
  const models = (await Promise.all(keys.map(async ({ name }) => {
    const d = await db.get(name); if (!d) return null;
    const r = JSON.parse(d);
    return Object.fromEntries(PUBLIC.map(f => [f, r[f]]).filter(([,v]) => v !== undefined));
  }))).filter(Boolean).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return res.status(200).json({ success: true, models });
}
