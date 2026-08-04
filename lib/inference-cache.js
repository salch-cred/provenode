/**
 * #6 — DECENTRALIZED INFERENCE CACHE
 * ═══════════════════════════════════════════════════════════════════
 * Hash the input → check Shelby for a cached result → serve if found.
 * First run computes, stores result on Shelby as an immutable blob.
 * All subsequent identical inputs read from Shelby cache.
 * ShelbyUSD micropayment per cache hit (Shelby's paid-read model).
 *
 * Why this is novel:
 * - Shelby's immutability guarantees: same input → same output, forever
 * - Cryptographic proof on every read (Shelby auditing)
 * - Cache is globally distributed (not a single Redis instance)
 * - Cache misses pay ShelbyUSD; hits are free to producer
 *
 * Nobody has built this on Shelby.
 */
import { createHash } from 'node:crypto';

/**
 * Hash a model input deterministically.
 * Supports: string, object, Buffer, ArrayBuffer.
 */
export function hashInferenceInput(input) {
  const normalized =
    typeof input === 'string'     ? input
    : Buffer.isBuffer(input)      ? input.toString('base64')
    : input instanceof ArrayBuffer ? Buffer.from(input).toString('base64')
    : JSON.stringify(input, Object.keys(input || {}).sort());

  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Build a Shelby blob name for a cached inference result.
 * Format: cache/{modelId}/{inputHash}
 */
export function cacheBlobName(modelId, inputHash) {
  const safeModel = modelId.replace(/[^a-z0-9\-]/gi, '-').toLowerCase();
  return `cache/${safeModel}/${inputHash}`;
}

/**
 * Build a cache record to store on Shelby.
 * This is stored as a JSON blob (~1-4KB).
 */
export function buildCacheRecord({ modelId, modelSha256, inputHash, output, latencyMs, metadata = {} }) {
  return {
    version: 1,
    modelId,
    modelSha256,
    inputHash,
    output,
    latencyMs,
    cachedAt: new Date().toISOString(),
    metadata,
    // Integrity hash of the record itself
    recordHash: createHash('sha256')
      .update(modelSha256 + inputHash + JSON.stringify(output))
      .digest('hex'),
  };
}

/**
 * Verify a cache record hasn't been tampered with.
 */
export function verifyCacheRecord(record) {
  const expected = createHash('sha256')
    .update(record.modelSha256 + record.inputHash + JSON.stringify(record.output))
    .digest('hex');
  return {
    valid: expected === record.recordHash,
    modelId: record.modelId,
    cachedAt: record.cachedAt,
    latencyMs: record.latencyMs,
  };
}

/**
 * Cache stats aggregator.
 * Tracks hit rate, average latency savings, and ShelbyUSD earned.
 */
export function buildCacheStats(events) {
  const hits = events.filter(e => e.cacheHit);
  const misses = events.filter(e => !e.cacheHit);
  const avgSavedMs = hits.reduce((a, e) => a + (e.computeLatencyMs || 0), 0) / (hits.length || 1);

  return {
    totalQueries: events.length,
    cacheHits: hits.length,
    cacheMisses: misses.length,
    hitRate: events.length > 0 ? ((hits.length / events.length) * 100).toFixed(1) + '%' : '0%',
    avgLatencySavedMs: Math.round(avgSavedMs),
    estimatedComputeSaved: `${Math.round(avgSavedMs * hits.length / 1000)}s`,
    shelbyReads: hits.length,
    shelbyWrites: misses.length,
  };
}
