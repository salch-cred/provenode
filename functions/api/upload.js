export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const rawName = formData.get('name');

    if (!file || typeof file === 'string') {
      return Response.json({ error: 'No file provided.' }, { status: 400 });
    }

    const modelName = (rawName || file.name || 'unnamed-model').toString().slice(0, 120);
    const bytes = await file.arrayBuffer();

    if (bytes.byteLength === 0) {
      return Response.json({ error: 'Uploaded file is empty.' }, { status: 400 });
    }
    if (bytes.byteLength > 100 * 1024 * 1024) {
      return Response.json({ error: 'File exceeds the 100 MB demo limit.' }, { status: 413 });
    }

    const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
    const sha256 = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    const id = crypto.randomUUID();
    const slug = modelName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'model';
    const blobName = `models/${slug}-${id.slice(0, 8)}`;

    let objectId = `demo://provenode/${blobName}`;
    let mode = 'demo';
    let warning;

    if (env.SHELBY_API_KEY) {
      try {
        const nodeBuffer = await import('node:buffer');
        globalThis.Buffer = nodeBuffer.Buffer;
        globalThis.process = { env: {} };

        const { ShelbyClient } = await import('@shelby-protocol/sdk/browser');
        const { Account, Network } = await import('@aptos-labs/ts-sdk');

        const client = new ShelbyClient({ network: Network.SHELBYNET, apiKey: env.SHELBY_API_KEY });
        const account = Account.generate();
        const expirationMicros = Date.now() * 1000 + 86400_000_000; // 24 hours

        // Fund APT for gas and ShelbyUSD for storage fees via the SDK's own
        // faucet helpers before attempting the real upload.
        await client.fundAccountWithAPT({ address: account.accountAddress, amount: 100_00000000 });
        await client.fundAccountWithShelbyUSD({ address: account.accountAddress, amount: 10000_00000000 });

        await client.upload({
          blobData: new Uint8Array(bytes),
          signer: account,
          blobName,
          expirationMicros
        });

        objectId = `shelby://shelbynet/${account.accountAddress.toString()}/${blobName}`;
        mode = 'shelby';
      } catch (err) {
        console.error('Shelby upload failed, falling back to demo registration:', err.message);
        warning = `Shelby upload failed (${err.message}); registered in demo mode instead.`;
      }
    }

    const record = {
      id,
      model: modelName,
      objectId,
      sha256,
      size: bytes.byteLength,
      mode,
      createdAt: new Date().toISOString()
    };

    if (env.PROVENODE_DB) {
      await env.PROVENODE_DB.put(`model:${id}`, JSON.stringify(record));
    }

    return Response.json({ success: true, id, objectId, hash: sha256, size: bytes.byteLength, mode, warning });
  } catch (err) {
    return Response.json({ error: err.message || 'Upload failed.' }, { status: 500 });
  }
}
