export async function onRequestGet(context) {
  return Response.json({
    shelby: {
      mode: context.env.SHELBY_MODE || 'demo',
      network: context.env.SHELBY_NETWORK || 'testnet',
      credentialsConfigured: Boolean(context.env.SHELBY_API_KEY)
    },
    console: '/app.html'
  }, { headers: { 'cache-control': 'no-store' } });
}
