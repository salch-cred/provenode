/**
 * #2 — FEDERATED LEARNING AGGREGATION
 * Edge devices upload gradient updates to Shelby.
 * Provenode aggregates via FedAvg, produces new global model.
 * First federated learning system with on-chain provenance.
 */
import { createHash } from 'node:crypto';

/**
 * FedAvg: Federated Averaging of gradient updates.
 * gradients: Array of Float32 gradient buffers from N devices.
 * Returns averaged gradient buffer.
 */
export function fedAvg(gradients) {
  if (!gradients || gradients.length === 0) throw new Error('No gradients provided');

  const n = gradients.length;
  const len = gradients[0].length;

  // Validate all same length
  for (const g of gradients) {
    if (g.length !== len) throw new Error('Gradient size mismatch between devices');
  }

  const averaged = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    let sum = 0;
    for (const g of gradients) sum += g[i];
    averaged[i] = sum / n;
  }

  return Buffer.from(averaged.buffer);
}

/**
 * Create a FL round record — tracks which devices contributed gradients.
 */
export function createFLRound({ modelId, roundNumber, deviceContributions }) {
  const contributionHashes = deviceContributions.map(d => ({
    deviceId: d.deviceId,
    gradientSha256: createHash('sha256').update(d.gradientBuffer).digest('hex'),
    sampleCount: d.sampleCount || 0,
    uploadedAt: d.uploadedAt || new Date().toISOString(),
  }));

  // Round hash = hash of all gradient hashes (proves each device contributed)
  const roundHash = createHash('sha256')
    .update(contributionHashes.map(c => c.gradientSha256).join(':'))
    .digest('hex');

  return {
    modelId,
    roundNumber,
    roundHash,
    participantCount: deviceContributions.length,
    contributions: contributionHashes,
    aggregationMethod: 'FedAvg',
    timestamp: new Date().toISOString(),
    status: 'pending_aggregation',
  };
}

/**
 * Weighted FedAvg: weight by each device's sample count (more data = more weight).
 */
export function weightedFedAvg(gradients, sampleCounts) {
  if (gradients.length !== sampleCounts.length) throw new Error('Mismatch');
  const totalSamples = sampleCounts.reduce((a, b) => a + b, 0);
  const len = gradients[0].length;
  const averaged = new Float32Array(len);

  for (let i = 0; i < len; i++) {
    let weighted = 0;
    for (let d = 0; d < gradients.length; d++) {
      weighted += gradients[d][i] * (sampleCounts[d] / totalSamples);
    }
    averaged[i] = weighted;
  }
  return Buffer.from(averaged.buffer);
}

/**
 * Generate on-chain receipt proving a device's gradient was included.
 * Device presents this receipt to claim contribution credit.
 */
export function generateContributionReceipt({ deviceId, roundHash, gradientSha256 }) {
  const receipt = {
    deviceId,
    roundHash,
    gradientSha256,
    receiptHash: createHash('sha256')
      .update(`${deviceId}:${roundHash}:${gradientSha256}`)
      .digest('hex'),
    issuedAt: new Date().toISOString(),
  };
  return receipt;
}
