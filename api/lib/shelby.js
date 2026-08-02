/**
 * Shared Shelby upload helper — used by both /api/upload and /api/deploy.
 *
 * Returns: { objectId: string, mode: 'shelby' | 'demo', warning?: string }
 *
 * When SHELBY_API_KEY is set, performs a real upload to Shelby shelbynet.
 * On any failure (bad key, faucet outage, rate-limit) it degrades gracefully
 * to demo mode and sets `warning` explaining what happened.
 */

export async function shelbyUpload({ blobData, blobName, apiKey }) {
  if (!apiKey) {
    return {
      objectId: `demo://provenode/${blobName}`,
      mode: 'demo',
    };
  }

  try {
    // nodejs_compat polyfills — needed in some edge environments
    if (typeof Buffer === 'undefined') {
      const nodeBuffer = await import('node:buffer');
      globalThis.Buffer = nodeBuffer.Buffer;
    }
    if (typeof process === 'undefined') {
      globalThis.process = { env: {} };
    }

    const { ShelbyClient } = await import('@shelby-protocol/sdk/browser');
    const { Account, Network } = await import('@aptos-labs/ts-sdk');

    const client = new ShelbyClient({ network: Network.SHELBYNET, apiKey });
    const account = Account.generate();
    const expirationMicros = Date.now() * 1000 + 86_400_000_000; // 24 h

    // Fund gas + storage fees via the SDK's own faucet helpers
    await client.fundAccountWithAPT({
      address: account.accountAddress,
      amount: 100_00000000,
    });
    await client.fundAccountWithShelbyUSD({
      address: account.accountAddress,
      amount: 10000_00000000,
    });

    await client.upload({
      blobData: blobData instanceof Uint8Array ? blobData : new Uint8Array(blobData),
      signer: account,
      blobName,
      expirationMicros,
    });

    return {
      objectId: `shelby://shelbynet/${account.accountAddress.toString()}/${blobName}`,
      mode: 'shelby',
    };
  } catch (err) {
    console.error('[shelby] upload failed, degrading to demo mode:', err.message);
    return {
      objectId: `demo://provenode/${blobName}`,
      mode: 'demo',
      warning: `Shelby upload failed (${err.message}); registered in demo mode instead.`,
    };
  }
}

/**
 * Build a deterministic blob name from a model slug and version.
 */
export function makeBlobName(slug, suffix = '') {
  const safe = slug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'model';
  return `models/${safe}${suffix}`;
}
