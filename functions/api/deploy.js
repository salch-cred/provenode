export async function onRequestPost(context) {
  const { request, env } = context;

  let data;
  try {
    data = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { modelId, modelName, version, region } = data;

  // If modelId is given, deploy the real artifact already registered via
  // /api/upload (its sha256/objectId are reused as-is instead of being
  // regenerated), so a deployment always traces back to a real uploaded file.
  let model = null;
  if (modelId) {
    if (!env.PROVENODE_DB) {
      return Response.json({ error: 'No database binding configured.' }, { status: 500 });
    }
    const raw = await env.PROVENODE_DB.get(`model:${modelId}`);
    if (!raw) {
      return Response.json({ error: 'Unknown modelId.' }, { status: 404 });
    }
    model = JSON.parse(raw);
  }

  const resolvedName = model?.model || modelName;
  const resolvedVersion = version || model?.version || 'latest';

  if (!resolvedName) {
    return Response.json({ error: 'modelName or modelId is required.' }, { status: 400 });
  }

  let sha256 = model?.sha256;
  let shelbyObjectId = model?.objectId;
  let mode = model?.mode || 'demo';
  let warning;

  // No pre-registered model to reuse (e.g. the built-in dashboard rollout
  // demo) — synthesize a manifest the same way /api/upload does, including a
  // real Shelby upload attempt when credentials are configured.
  if (!sha256) {
    const seed = resolvedName + resolvedVersion + Date.now().toString();
    const blobData = new TextEncoder().encode(seed);
    const hashBuffer = await crypto.subtle.digest('SHA-256', blobData);
    sha256 = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    const slug = resolvedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'model';
    const blobName = `models/${slug}-${resolvedVersion}-${Date.now()}`;
    shelbyObjectId = `demo://provenode/${blobName}`;

    if (env.SHELBY_API_KEY) {
      try {
        const nodeBuffer = await import('node:buffer');
        globalThis.Buffer = nodeBuffer.Buffer;
        globalThis.process = { env: {} };

        const { ShelbyClient } = await import('@shelby-protocol/sdk/browser');
        const { Account, Network } = await import('@aptos-labs/ts-sdk');

        // Network.SHELBYNET alone is enough — the SDK resolves the correct
        // RPC, Aptos fullnode and indexer URLs for that network internally.
        const client = new ShelbyClient({ network: Network.SHELBYNET, apiKey: env.SHELBY_API_KEY });
        const account = Account.generate();
        const expirationMicros = Date.now() * 1000 + 86400_000_000; // 24 hours

        // Fund APT for gas and ShelbyUSD for storage fees via the SDK's own
        // faucet helpers, which know the real faucet endpoints and already
        // wait for the funding transactions to land.
        await client.fundAccountWithAPT({ address: account.accountAddress, amount: 100_00000000 });
        await client.fundAccountWithShelbyUSD({ address: account.accountAddress, amount: 10000_00000000 });

        await client.upload({ blobData, signer: account, blobName, expirationMicros });

        shelbyObjectId = `shelby://shelbynet/${account.accountAddress.toString()}/${blobName}`;
        mode = 'shelby';
      } catch (err) {
        console.error('Shelby deploy-time upload failed, falling back to demo manifest:', err.message);
        warning = `Shelby upload failed (${err.message}); deploying in demo mode instead.`;
      }
    }
  }

  const manifest = {
    id: crypto.randomUUID(),
    model: resolvedName,
    version: resolvedVersion,
    region: region || 'Global',
    sha256,
    shelbyObjectId,
    commitment: '0x' + sha256.substring(0, 12),
    mode,
    status: 'deploying',
    progress: 0,
    createdAt: new Date().toISOString()
  };

  try {
    if (env.PROVENODE_DB) {
      await env.PROVENODE_DB.put(`deployment:${manifest.id}`, JSON.stringify(manifest));
      await env.PROVENODE_DB.put(`devices:${manifest.id}`, JSON.stringify({ verified: 0, target: 248 }));
    }
    return Response.json({ success: true, manifest, warning });
  } catch (err) {
    console.error('Deploy error:', err.stack);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
