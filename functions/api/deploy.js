export async function onRequestPost(context) {
  const nodeBuffer = await import('node:buffer');
  globalThis.Buffer = nodeBuffer.Buffer;
  globalThis.process = { env: {} };
  
  const { ShelbyClient } = await import('@shelby-protocol/sdk/browser');
  const { Account } = await import('@aptos-labs/ts-sdk');

  const { request, env } = context;
  
  if (!env.SHELBY_API_KEY) {
    return Response.json({ error: "SHELBY_API_KEY is not configured in Cloudflare Pages." }, { status: 401 });
  }

  try {
    const data = await request.json();
    const { modelName, version, region } = data;
    
    // Create a dummy payload buffer for the "model"
    const randomData = modelName + version + Date.now().toString();
    const blobData = new TextEncoder().encode(randomData);
    
    // 1. Generate real SHA-256
    const hashBuffer = await crypto.subtle.digest('SHA-256', blobData);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    // 2. Configure Shelby browser client for the testnet/shelbynet
    const client = new ShelbyClient({ 
      network: "shelbynet",
      apiKey: env.SHELBY_API_KEY,
      rpc: {
        baseUrl: "https://api.shelbynet.shelby.xyz/shelby"
      },
      aptos: {
        fullnode: "https://api.shelbynet.shelby.xyz/v1",
        indexer: "https://api.shelbynet.shelby.xyz/graphql"
      }
    });
    
    // Generate an ephemeral signer for the upload
    const account = Account.generate();
    const blobName = `models/${modelName.toLowerCase().replace(/\s+/g, '-')}-${version}-${Date.now()}`;
    const expirationMicros = Date.now() * 1000 + 86400_000_000; // 24 hours
    
    try {
      // Fund APT for gas (100 APT)
      const aptRes = await fetch("https://faucet.shelbynet.shelby.xyz/fund?asset=apt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: account.accountAddress.toString(), amount: 10000000000 })
      });
      const aptData = await aptRes.json();
      for (const hash of (aptData.txn_hashes || [])) {
        await client.aptos.waitForTransaction({ transactionHash: hash });
      }

      // Fund ShelbyUSD for storage fees (10000 ShelbyUSD)
      const usdRes = await fetch("https://faucet.shelbynet.shelby.xyz/fund?asset=shelbyusd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: account.accountAddress.toString(), amount: 100000000000 })
      });
      const usdData = await usdRes.json();
      for (const hash of (usdData.txn_hashes || [])) {
        await client.aptos.waitForTransaction({ transactionHash: hash });
      }
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
