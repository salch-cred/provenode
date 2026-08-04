/**
 * Shelby Protocol helper — Testnet (Early Access)
 * Docs: https://docs.shelby.xyz/sdks/typescript/node
 *
 * Architecture:
 * - Shelby's own contract (blob storage):  0x85fdb9a176ab8ef1d9d9c1b60d60b3924f0800ac1de1cc2085fb0b8bb4988e6a
 * - Provenode ModelRegistry (our contract): 0x77f8cb3dde7d8347cbaa1043889e79077489af6ed828e273f0283bfeccd39d18
 * - Both live on Aptos Testnet
 * - Shelby RPC (testnet): https://api.testnet.shelby.xyz/shelby
 * - Download URL: https://api.testnet.shelby.xyz/shelby/v1/blobs/{address}/{blobName}
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
  // No API key → demo mode, no real upload
  if (!apiKey) {
    return { objectId: `demo://provenode/${blobName}`, mode: 'demo' };
  }

  try {
    // Import the Node.js SDK entry point (not /browser)
    const { ShelbyNodeClient } = await import('@shelby-protocol/sdk/node');
    const { Network, Ed25519Account, Ed25519PrivateKey } = await import('@aptos-labs/ts-sdk');

    // Determine network from env
    const networkStr = process.env.SHELBY_NETWORK || 'testnet';
    const network = networkStr === 'shelbynet' ? Network.SHELBYNET : Network.TESTNET;
    const rpcBase = network === Network.TESTNET
      ? 'https://api.testnet.shelby.xyz'
      : 'https://api.shelbynet.shelby.xyz';

    // Init client with API key
    const client = new ShelbyNodeClient({ network, apiKey });

    // Get or create account
    const privKey = process.env.SHELBY_PRIVATE_KEY;
    let account;
    if (privKey) {
      // Use persistent org account from SHELBY_PRIVATE_KEY
      account = new Ed25519Account({
        privateKey: new Ed25519PrivateKey(privKey),
      });
    } else {
      // Ephemeral account — only works on shelbynet which has a faucet
      const { Account } = await import('@aptos-labs/ts-sdk');
      account = Account.generate();
    }

    const addressStr = account.accountAddress.toString();

    // Expiration: 90 days from now (in microseconds)
    const expirationMicros = (Date.now() + 90 * 24 * 60 * 60 * 1000) * 1000;

    // Upload — docs use "account" (not "signer")
    await client.upload({
      account,
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
    console.error('[shelby] upload failed:', err.message);
    return { objectId: `demo://provenode/${blobName}`, mode: 'demo', warning: err.message };
  }
}

/**
 * Download a blob from Shelby by address + blobName.
 * GET https://api.testnet.shelby.xyz/shelby/v1/blobs/{address}/{blobName}
 */
export async function shelbyDownload({ address, blobName }) {
  const networkStr = process.env.SHELBY_NETWORK || 'testnet';
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
