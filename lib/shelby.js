/**
 * Shelby Protocol helper — persistent org identity + upload
 * Network: Shelbynet  API: https://api.shelbynet.shelby.xyz/v1
 */

export async function getOrgAccount() {
  const privKey = process.env.SHELBY_PRIVATE_KEY;
  if (!privKey) return null;
  try {
    const { Account, Ed25519PrivateKey } = await import('@aptos-labs/ts-sdk');
    return Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(privKey) });
  } catch { return null; }
}

export async function shelbyUpload({ blobData, blobName, apiKey }) {
  if (!apiKey) return { objectId: `demo://provenode/${blobName}`, mode: 'demo' };
  try {
    const nodeBuffer = await import('node:buffer');
    if (typeof Buffer === 'undefined') globalThis.Buffer = nodeBuffer.Buffer;
    if (typeof process === 'undefined') globalThis.process = { env: {} };

    const { ShelbyClient } = await import('@shelby-protocol/sdk/browser');
    const { Account, Network, Ed25519PrivateKey } = await import('@aptos-labs/ts-sdk');

    const client = new ShelbyClient({ network: Network.SHELBYNET, apiKey });

    // Use persistent org account if available, else ephemeral
    let account;
    const privKey = process.env.SHELBY_PRIVATE_KEY;
    if (privKey) {
      account = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(privKey) });
    } else {
      account = Account.generate();
      await client.fundAccountWithAPT({ address: account.accountAddress, amount: 100_00000000 });
      await client.fundAccountWithShelbyUSD({ address: account.accountAddress, amount: 10000_00000000 });
    }

    const expirationMicros = Date.now() * 1000 + 86_400_000_000 * 90; // 90 days
    await client.upload({
      blobData: blobData instanceof Uint8Array ? blobData : new Uint8Array(blobData),
      signer: account,
      blobName,
      expirationMicros,
    });

    return {
      objectId: `shelby://shelbynet/${account.accountAddress.toString()}/${blobName}`,
      mode: 'shelby',
      address: account.accountAddress.toString(),
      expiresAt: new Date(Date.now() + 86_400_000 * 90).toISOString(),
    };
  } catch (err) {
    console.error('[shelby] upload failed:', err.message);
    return { objectId: `demo://provenode/${blobName}`, mode: 'demo', warning: err.message };
  }
}

export function makeBlobName(slug, suffix = '') {
  const safe = slug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'model';
  return `models/${safe}${suffix}`;
}
