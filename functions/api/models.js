export async function onRequestGet(context) {
  const { env } = context;

  if (!env.PROVENODE_DB) {
    return Response.json({ success: true, models: [] }, { headers: { 'cache-control': 'no-store' } });
  }

  const list = await env.PROVENODE_DB.list({ prefix: 'model:' });
  const models = [];
  for (const key of list.keys) {
    const data = await env.PROVENODE_DB.get(key.name);
    if (data) models.push(JSON.parse(data));
  }
  models.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return Response.json({ success: true, models }, { headers: { 'cache-control': 'no-store' } });
}
