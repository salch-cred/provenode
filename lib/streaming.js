/**
 * #1 — STREAMING MODEL INFERENCE
 * Splits model blobs into ordered chunks for pipeline-parallel inference.
 * Devices stream chunk-by-chunk instead of downloading full model.
 * Leverages Shelby's hot storage + erasure coding for Web2-grade speed.
 */
import { createHash } from 'node:crypto';

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB per chunk (Shelby sweet-spot)

/**
 * Split a model buffer into ordered inference chunks and upload each to Shelby.
 * Returns a stream manifest: ordered list of Shelby objectIds + chunk metadata.
 */
export async function createStreamManifest({ buffer, modelId, modelName, apiKey }) {
  if (!apiKey) throw new Error('SHELBY_API_KEY not configured. Real mode requires a Shelby API key.');
  const chunks = [];
  let offset = 0;
  let index = 0;

  while (offset < buffer.length) {
    const chunk = buffer.slice(offset, offset + CHUNK_SIZE);
    const sha = createHash('sha256').update(chunk).digest('hex');
    chunks.push({ index, offset, size: chunk.length, sha256: sha, data: chunk });
    offset += CHUNK_SIZE;
    index++;
  }

  // Upload each chunk to Shelby
  const manifest = {
    modelId,
    modelName,
    totalSize: buffer.length,
    chunkCount: chunks.length,
    chunkSize: CHUNK_SIZE,
    chunks: [],
    createdAt: new Date().toISOString(),
    streamable: true,
  };

  const privKey = process.env.SHELBY_PRIVATE_KEY;
  if (!privKey) throw new Error('SHELBY_PRIVATE_KEY not configured. Real mode requires a persistent org account.');
  const { ShelbyNodeClient } = await import('@shelby-protocol/sdk/node');
  const { Network, Ed25519Account, Ed25519PrivateKey } = await import('@aptos-labs/ts-sdk');
  const networkStr = process.env.SHELBY_NETWORK || 'shelbynet';
  const network = networkStr === 'shelbynet' ? Network.SHELBYNET : Network.TESTNET;
  const client = new ShelbyNodeClient({ network, apiKey });
  const account = new Ed25519Account({ privateKey: new Ed25519PrivateKey(privKey) });

  for (const chunk of chunks) {
    const blobName = `streams/${modelId}/chunk-${String(chunk.index).padStart(4, '0')}`;
    const expirationMicros = Date.now() * 1000 + 86_400_000_000 * 90;
    await client.upload({
      blobData: new Uint8Array(chunk.data),
      signer: account,
      blobName,
      expirationMicros,
    });

    manifest.chunks.push({
      index: chunk.index,
      objectId: `shelby://shelbynet/${account.accountAddress.toString()}/${blobName}`,
      size: chunk.size,
      sha256: chunk.sha256,
      offset: chunk.offset,
    });
  }

  // Full manifest SHA-256 = hash of all chunk SHAs
  manifest.manifestSha256 = createHash('sha256')
    .update(manifest.chunks.map(c => c.sha256).join(''))
    .digest('hex');

  return manifest;
}

/**
 * Generate a signed streaming URL for a single chunk (pay-per-inference model).
 * In production this would gate on ShelbyUSD micropayment receipt.
 */
export function getChunkUrl(objectId, deviceId) {
  const secret = process.env.DEPLOY_SECRET;
  if (!secret) throw new Error('DEPLOY_SECRET not configured. Real mode requires a deploy secret for signed chunk URLs.');
  const token = createHash('sha256')
    .update(`${objectId}:${deviceId}:${secret}`)
    .digest('hex')
    .slice(0, 16);
  return { objectId, accessToken: token, expiresIn: 3600 };
}
