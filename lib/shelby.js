/**
 * Shelby Protocol helper — Testnet (Early Access)
 * Network: Aptos Testnet via Shelby early access
 * SDK: ShelbyNodeClient with Network.TESTNET
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
  // No API key → demo mode
  if (!apiKey) return { objectId: `demo://provenode/${blobName}`, mode: 'demo' };

  try {
    const { ShelbyNodeClient } = await import('@shelby-protocol/sdk/node');
    const { Account, Network, Ed25519PrivateKey } = await import('@aptos-labs/ts-sdk');

    // Use Network.TESTNET for Shelby early access testnet
    const network = process.env.SHELBY_NETWORK === 'shelbynet'
      ? Network.SHELBYNET
      : Network.TESTNET;

    const client = new ShelbyNodeClient({ network, apiKey });

    // Use persistent org account from SHELBY_PRIVATE_KEY
    const privKey = process.env.SHELBY_PRIVATE_KEY;
    let account;
    if (privKey) {
      account = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(privKey) });
    } else {
      // Ephemeral account — only works on shelbynet (has faucet)
      account = Account.generate();
      if (network === Network.SHELBYNET) {
        await client.fundAccountWithAPT({ address: account.accountAddress, amount: 100_00000000 });
        await client.fundAccountWithShelbyUSD({ address: account.accountAddress, amount: 10000_00000000 });
      }
    }

    const expirationMicros = Date.now() * 1000 + 86_400_000_000 * 90; // 90 days

    await client.upload({
      blobData: blobData instanceof Uint8Array ? blobData : new Uint8Array(blobData),
      signer: account,
      blobName,
      expirationMicros,
    });

    return {
      objectId: `shelby://${network === Network.TESTNET ? 'testnet' : 'shelbynet'}/${account.accountAddress.toString()}/${blobName}`,
      mode: 'shelby',
      network: network === Network.TESTNET ? 'testnet' : 'shelbynet',
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
