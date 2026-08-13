/**
 * Shelby Protocol helper — Shelbynet (real network)
 * Docs: https://docs.shelby.xyz/sdks/typescript/node
 *
 * Architecture:
 * - Shelby's own contract (blob storage):  0x85fdb9a176ab8ef1d9d9c1b60d60b3924f0800ac1de1cc2085fb0b8bb4988e6a
 * - Provenode ModelRegistry (our contract): 0x77f8cb3dde7d8347cbaa1043889e79077489af6ed828e273f0283bfeccd39d18
 * - Default network: Shelbynet (set SHELBY_NETWORK=testnet to opt out)
 * - Shelby RPC (shelbynet): https://api.shelbynet.shelby.xyz/shelby
 * - Download URL: https://api.shelbynet.shelby.xyz/shelby/v1/blobs/{address}/{blobName}
 */

/**
 * Get org account from SHELBY_PRIVATE_KEY.
 * Uses Ed25519Account as per Shelby docs (not Account.fromPrivateKey).
 */
export async function getOrgAccount() {
  const privKey = process.env.SHELBY_PRIVATE_KEY;
  if (!privKey) return null;
  try {
    const { Ed25519Account, Ed25519PrivateKey } = await import('@aptos-labs/ts-sdk');
    return new Ed25519Account({
      privateKey: new Ed25519PrivateKey(privKey),
    });
  } catch { return null; }
}

/**
 * Upload a blob to Shelby.
 * Uses ShelbyNodeClient from @shelby-protocol/sdk/node (server-side).
 * Network: TESTNET for Shelby early access, SHELBYNET for dev prototype.
 *
 * Returns a Shelby download URL:
 * https://api.testnet.shelby.xyz/shelby/v1/blobs/{account_address}/{blobName}
 */
export async function shelbyUpload({ blobData, blobName, apiKey }) {
  // Real mode only — no demo storage. Fail loudly when not configured.
  if (!apiKey) throw new Error('SHELBY_API_KEY not configured. Real mode requires a Shelby API key.');

  try {
    // Import the Node.js SDK entry point (not /browser)
    const { ShelbyNodeClient } = await import('@shelby-protocol/sdk/node');
    const { Network, Ed25519Account, Ed25519PrivateKey } = await import('@aptos-labs/ts-sdk');

    // Determine network from env
    const networkStr = process.env.SHELBY_NETWORK || 'shelbynet';
    const network = networkStr === 'shelbynet' ? Network.SHELBYNET : Network.TESTNET;
    const rpcBase = network === Network.TESTNET
      ? 'https://api.testnet.shelby.xyz'
      : 'https://api.shelbynet.shelby.xyz';

    // Init client with API key
    const client = new ShelbyNodeClient({ network, apiKey });

    // Real mode requires the persistent org identity (stable address, funds blobs).
    const privKey = process.env.SHELBY_PRIVATE_KEY;
    if (!privKey) throw new Error('SHELBY_PRIVATE_KEY not configured. Real mode requires a persistent org account.');
    const account = new Ed25519Account({
      privateKey: new Ed25519PrivateKey(privKey),
    });

    const addressStr = account.accountAddress.toString();

    // Expiration: 90 days from now (in microseconds)
    const expirationMicros = (Date.now() + 90 * 24 * 60 * 60 * 1000) * 1000;

    // Real SDK v0.3.1 expects `signer` (the paying/signing account).
    // Passing `account` was silently ignored and broke real uploads.
    await client.upload({
      signer: account,
      blobData: blobData instanceof Uint8Array ? blobData : new Uint8Array(blobData),
      blobName,
      expirationMicros,
    });

    // Return the direct download URL per Shelby docs:
    // https://api.testnet.shelby.xyz/shelby/v1/blobs/{address}/{blobName}
    const downloadUrl = `${rpcBase}/shelby/v1/blobs/${addressStr}/${blobName}`;

    return {
      objectId: downloadUrl,
      mode: 'shelby',
      network: networkStr,
      address: addressStr,
      blobName,
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    };
  } catch (err) {
    // Real mode: surface the failure — never fall back to a fake demo blob.
    console.error('[shelby] upload failed:', err.message);
    throw new Error(`Shelby upload failed: ${err.message}`);
  }
}

/**
 * Download a blob from Shelby as a Buffer using the real SDK client.
 * Real mode only — throws (no demo fallback) if the API key is missing
 * or the blob cannot be retrieved/decoded.
 */
export async function shelbyDownloadBlob({ address, blobName, apiKey }) {
  if (!apiKey) throw new Error('SHELBY_API_KEY not configured.');
  const { ShelbyNodeClient } = await import('@shelby-protocol/sdk/node');
  const { Network } = await import('@aptos-labs/ts-sdk');
  const networkStr = process.env.SHELBY_NETWORK || 'shelbynet';
  const network = networkStr === 'shelbynet' ? Network.SHELBYNET : Network.TESTNET;
  const client = new ShelbyNodeClient({ network, apiKey });
  const blob = await client.download({ account: address, blobName });
  const buffer = Buffer.from(await new Response(blob.readable).arrayBuffer());
  return { buffer, contentLength: blob.contentLength };
}

/**
 * Download a blob from Shelby by address + blobName.
 * GET https://api.testnet.shelby.xyz/shelby/v1/blobs/{address}/{blobName}
 */
export async function shelbyDownload({ address, blobName }) {
  const networkStr = process.env.SHELBY_NETWORK || 'shelbynet';
  const rpcBase = networkStr === 'shelbynet'
    ? 'https://api.shelbynet.shelby.xyz'
    : 'https://api.testnet.shelby.xyz';

  const url = `${rpcBase}/shelby/v1/blobs/${address}/${blobName}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Shelby download failed: ${res.status} ${url}`);
  return res.arrayBuffer().then(b => Buffer.from(b));
}

/**
 * Make a safe Shelby blob name from a model slug.
 */
export function makeBlobName(slug, suffix = '') {
  const safe = slug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'model';
  return `models/${safe}${suffix}`;
}
