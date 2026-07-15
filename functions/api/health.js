export async function onRequestGet(context) {
  return Response.json({ ok: true, service: 'ModelRelay', platform: 'cloudflare-pages', mode: context.env.SHELBY_MODE || 'demo' }, { headers: { 'cache-control': 'no-store' } });
}
