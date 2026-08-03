/**
 * #10 — TRAINING DATA REGISTRY (Dataset Provenance)
 * Upload dataset shards to Shelby + register on Aptos.
 * Links datasets to model versions — "this model trained on THESE datasets."
 * EU AI Act compliance + copyright + GDPR right-to-forget.
 */
import { createHash } from 'node:crypto';

const SHARD_SIZE = 10 * 1024 * 1024; // 10MB shards

/**
 * Compute Merkle root of dataset SHA-256 hashes.
 * Standard binary Merkle tree.
 */
export function computeMerkleRoot(hashes) {
  if (hashes.length === 0) return null;
  if (hashes.length === 1) return hashes[0];

  let layer = hashes.map(h => Buffer.from(h, 'hex'));

  while (layer.length > 1) {
    const next = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i];
      const right = i + 1 < layer.length ? layer[i + 1] : layer[i];
      next.push(createHash('sha256').update(Buffer.concat([left, right])).digest());
    }
    layer = next;
  }

  return layer[0].toString('hex');
}

/**
 * Split a dataset buffer into shards for Shelby upload.
 */
export function shardDataset(buffer, datasetName) {
  const shards = [];
  let offset = 0;
  let index = 0;

  while (offset < buffer.length) {
    const shard = buffer.slice(offset, offset + SHARD_SIZE);
    shards.push({
      index,
      name: `datasets/${datasetName}/shard-${String(index).padStart(5, '0')}`,
      size: shard.length,
      sha256: createHash('sha256').update(shard).digest('hex'),
      data: shard,
    });
    offset += SHARD_SIZE;
    index++;
  }

  return shards;
}

/**
 * Build a DatasetRecord for on-chain registration.
 * Matches the Move contract DatasetRecord struct.
 */
export function buildDatasetRecord({ name, shards, license, source, description }) {
  const shardHashes = shards.map(s => s.sha256);
  const merkleRoot = computeMerkleRoot(shardHashes);
  const id = createHash('sha256')
    .update(`${name}:${merkleRoot}:${Date.now()}`)
    .digest('hex')
    .slice(0, 16);

  return {
    id,
    name,
    merkleRoot,
    shardCount: shards.length,
    totalBytes: shards.reduce((acc, s) => acc + s.size, 0),
    license: license || 'proprietary',
    source: source || 'unknown',
    description: description || '',
    registeredAt: new Date().toISOString(),
    shards: shards.map(s => ({
      index: s.index,
      sha256: s.sha256,
      size: s.size,
      shelbyObjectId: null, // filled after upload
    })),
  };
}

/**
 * Verify dataset integrity — re-compute Merkle root from shard SHAs.
 */
export function verifyDatasetIntegrity(record, shardShas) {
  const recomputed = computeMerkleRoot(shardShas);
  return {
    valid: recomputed === record.merkleRoot,
    expected: record.merkleRoot,
    actual: recomputed,
  };
}

/**
 * Build GDPR right-to-forget request record.
 * Marks dataset as "deletion requested" — model must be retrained.
 */
export function buildDeletionRequest({ datasetId, requestedBy, reason }) {
  return {
    datasetId,
    requestedBy,
    reason,
    requestHash: createHash('sha256')
      .update(`${datasetId}:${requestedBy}:${Date.now()}`)
      .digest('hex'),
    requestedAt: new Date().toISOString(),
    status: 'pending',
    affectedModels: [], // populated by registry lookup
  };
}
