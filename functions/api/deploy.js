export async function onRequestPost(context) {
  const nodeBuffer = await import('node:buffer');
  globalThis.Buffer = nodeBuffer.Buffer;
  globalThis.process = { env: {} };

  const { ShelbyClient } = await import('@shelby-protocol/sdk/browser');
  const { Account, Network } = await import('@aptos-labs/ts-sdk');

  const { request, env } = context;

  if (!env.SHELBY_API_KEY) {
    return Response.json({ error: "SHELBY_API_KEY is not configured in Cloudflare Pages." }, { status: 401 });
  }

  try {
    const data = await request.json();
    const { modelName, version, region } = data;

    if (!modelName || !version) {
      return Response.json({ error: "modelName and version are required." }, { status: 400 });
    }

    // Create a dummy payload buffer for the "model"
    const randomData = modelName + version + Date.now().toString();
    const blobData = new TextEncoder().encode(randomData);

    // 1. Generate real SHA-256
    const hashBuffer = await crypto.subtle.digest('SHA-256', blobData);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // 2. Configure the Shelby client for shelbynet. Network.SHELBYNET alone is
    // enough — the SDK resolves the correct RPC, Aptos fullnode and indexer
    // URLs for that network internally, so we don't hand-transcribe them here.
    const client = new ShelbyClient({
      network: Network.SHELBYNET,
      apiKey: env.SHELBY_API_KEY
    });

    // Generate an ephemeral signer for the upload
    const account = Account.generate();
    const blobName = `models/${modelName.toLowerCase().replace(/\s+/g, '-')}-${version}-${Date.now()}`;
    const expirationMicros = Date.now() * 1000 + 86400_000_000; // 24 hours

    try {
      // Fund APT for gas (100 APT) and ShelbyUSD for storage fees (10000 ShelbyUSD)
      // via the SDK's own faucet helpers, which know the real faucet endpoints
      // and already wait for the funding transactions to land.
      await client.fundAccountWithAPT({ address: account.accountAddress, amount: 100_00000000 });
      await client.fundAccountWithShelbyUSD({ address: account.accountAddress, amount: 10000_00000000 });
    } catch (err) {
      console.log("Faucet funding failed, proceeding anyway...", err.message);
    }

    // 3. Perform the real Shelby upload
    console.log("Uploading blob to Shelby testnet...");
    await client.upload({
      blobData,
      signer: account,
      blobName: blobName,
      expirationMicros
    });

    const shelbyObjectId = `shelby://shelbynet/${account.accountAddress.toString()}/${blobName}`;
    const commitment = sha256.substring(0, 12); // Shortened for demo display

    // 4. Create deployment manifest
    const manifest = {
      id: crypto.randomUUID(),
      model: modelName,
      version: version,
      region: region || "Global",
      sha256: sha256,
      shelbyObjectId: shelbyObjectId,
      commitment: "0x" + commitment,
      status: "deploying",
      progress: 0,
      createdAt: new Date().toISOString()
    };

    // 5. Store in KV Database
    await env.PROVENODE_DB.put(`deployment:${manifest.id}`, JSON.stringify(manifest));
    await env.PROVENODE_DB.put(`devices:${manifest.id}`, JSON.stringify({ verified: 0, target: 100 }));

    return Response.json({ success: true, manifest });
  } catch (err) {
    console.error("Deploy error:", err.stack);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
