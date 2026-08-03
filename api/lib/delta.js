/**
 * #3 — DELTA UPLOAD (Model Diff Protocol)
 * XOR-based binary diff between model versions.
 * Upload only the delta (~1-5% of model size) to Shelby.
 * On-chain DAG tracks version lineage: v1.0 → v1.1 → v1.2
 */
import { createHash } from 'node:crypto';

/**
 * Compute binary delta between two model buffers (XOR + run-length encoding).
 * Returns a compact patch buffer + metadata.
 */
export function computeDelta(baseBuffer, newBuffer) {
  const len = Math.max(baseBuffer.length, newBuffer.length);
  const patches = [];
  let i = 0;

  while (i < len) {
    const b = i < baseBuffer.length ? baseBuffer[i] : 0;
    const n = i < newBuffer.length ? newBuffer[i] : 0;
    if (b !== n) {
      // Find run of changed bytes
      let runStart = i;
      let runData = [];
      while (i < len) {
        const bb = i < baseBuffer.length ? baseBuffer[i] : 0;
        const nn = i < newBuffer.length ? newBuffer[i] : 0;
        if (bb === nn && runData.length > 0) break;
        runData.push(nn);
        i++;
      }
      patches.push({ offset: runStart, data: Buffer.from(runData) });
    } else {
      i++;
    }
  }

  // Serialize: [4B offset][4B length][data] per patch
  const parts = patches.map(p => {
    const hdr = Buffer.allocUnsafe(8);
    hdr.writeUInt32BE(p.offset, 0);
    hdr.writeUInt32BE(p.data.length, 4);
    return Buffer.concat([hdr, p.data]);
  });

  const deltaBuffer = Buffer.concat(parts);
  const compressionRatio = baseBuffer.length > 0
    ? ((1 - deltaBuffer.length / newBuffer.length) * 100).toFixed(1)
    : '0';

  return {
    deltaBuffer,
    patchCount: patches.length,
    baseSize: baseBuffer.length,
    newSize: newBuffer.length,
    deltaSize: deltaBuffer.length,
    compressionRatio: `${compressionRatio}%`,
    baseSha256: createHash('sha256').update(baseBuffer).digest('hex'),
    newSha256: createHash('sha256').update(newBuffer).digest('hex'),
    deltaSha256: createHash('sha256').update(deltaBuffer).digest('hex'),
  };
}

/**
 * Apply a delta patch to a base buffer to reconstruct the new version.
 */
export function applyDelta(baseBuffer, deltaBuffer) {
  const result = Buffer.from(baseBuffer);
  let i = 0;
  const extended = [];

  while (i < deltaBuffer.length) {
    const offset = deltaBuffer.readUInt32BE(i); i += 4;
    const length = deltaBuffer.readUInt32BE(i); i += 4;
    const data = deltaBuffer.slice(i, i + length); i += length;

    // Extend result if needed
    while (extended.length < offset + length) extended.push(0);
    for (let j = 0; j < data.length; j++) {
      if (offset + j < result.length) {
        result[offset + j] = data[j];
      } else {
        extended[offset + j - result.length] = data[j];
      }
    }
  }

  return extended.length > 0 ? Buffer.concat([result, Buffer.from(extended)]) : result;
}

/**
 * Build a version DAG node for on-chain storage.
 */
export function buildVersionNode({ parentSha256, newSha256, deltaObjectId, version, notes = '' }) {
  return {
    version,
    parentSha256: parentSha256 || null,
    newSha256,
    deltaObjectId,
    nodeHash: createHash('sha256')
      .update(`${parentSha256 || ''}:${newSha256}:${version}`)
      .digest('hex'),
    timestamp: new Date().toISOString(),
    notes,
    type: parentSha256 ? 'delta' : 'base',
  };
}
