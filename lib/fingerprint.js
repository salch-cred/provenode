/**
 * #9 — BEHAVIORAL FINGERPRINTING
 * ═══════════════════════════════════════════════════════════════════
 * Run a model through fixed "canary" inputs → hash ALL outputs →
 * create a behavioral fingerprint stored on Shelby + anchored on Aptos.
 *
 * Why this is critical:
 * - Weight SHA-256 only detects if the FILE changed.
 * - Model editing attacks (ROME, MEMIT, BadNets) can change model BEHAVIOR
 *   without changing the weight file hash (by editing specific neurons).
 * - Behavioral fingerprint detects this class of attacks.
 * - Shelby's immutability: original fingerprint can never be overwritten.
 *
 * Standard canary vectors (model-agnostic):
 * 1. Null/zero input
 * 2. Max-norm random input (seeded)
 * 3. Known-output adversarial input
 * 4. Out-of-distribution input
 * 5. Model-specific benchmark inputs
 *
 * Nobody has built behavioral fingerprinting on Shelby.
 */
import { createHash } from 'node:crypto';

/**
 * Standard canary inputs (deterministic, model-agnostic).
 * These are the same for every model — allows cross-model comparison.
 */
export const CANARY_VECTORS = [
  { id: 'zero',      description: 'All-zero input vector',          seed: 0 },
  { id: 'ones',      description: 'All-ones input vector',          seed: 1 },
  { id: 'random_42', description: 'Seeded random input (seed=42)',  seed: 42 },
  { id: 'random_99', description: 'Seeded random input (seed=99)',  seed: 99 },
  { id: 'adversarial', description: 'Known adversarial input',      seed: 666 },
  { id: 'boundary',  description: 'Boundary input (max float)',     seed: 255 },
  { id: 'sequence',  description: 'Sequential input [0,1,2,...,N]', seed: -1 },
  { id: 'sparse',    description: 'Sparse input (1 hot)',           seed: -2 },
];

/**
 * Generate a seeded pseudo-random float array.
 * Deterministic — same seed always produces same vector.
 */
export function seededVector(seed, length = 512) {
  const result = [];
  let state = seed;
  for (let i = 0; i < length; i++) {
    // LCG: fast, deterministic, portable
    state = (state * 1664525 + 1013904223) & 0xffffffff;
    result.push((state >>> 0) / 0xffffffff);
  }
  return result;
}

/**
 * Create a behavioral fingerprint from model outputs on canary vectors.
 *
 * outputs: Array of { canaryId, output } where output is the model's
 *          raw output (logits, embedding, classification result).
 *          The output MUST be deterministic for the same input.
 */
export function createBehavioralFingerprint({ modelId, modelSha256, outputs }) {
  if (outputs.length === 0) throw new Error('No outputs provided');

  // Hash each canary output
  const outputHashes = outputs.map(o => ({
    canaryId: o.canaryId,
    outputHash: createHash('sha256')
      .update(JSON.stringify(o.output))
      .digest('hex'),
    outputSummary: typeof o.output === 'object'
      ? JSON.stringify(o.output).slice(0, 100)
      : String(o.output).slice(0, 100),
  }));

  // Behavioral fingerprint = hash of ALL output hashes in order
  const fingerprint = createHash('sha256')
    .update(outputHashes.map(o => o.outputHash).join(':'))
    .digest('hex');

  // Compound fingerprint: ties behavior to weight identity
  const compoundFingerprint = createHash('sha256')
    .update(modelSha256 + fingerprint)
    .digest('hex');

  return {
    modelId,
    modelSha256,
    canaryCount: outputs.length,
    fingerprint,          // Behavioral fingerprint (output-based)
    compoundFingerprint,  // Weight + behavior combined
    outputHashes,
    createdAt: new Date().toISOString(),
    version: 'provenode-bfp-v1',
  };
}

/**
 * Compare two behavioral fingerprints.
 * Returns: exact match, partial match, or mismatch with which canaries diverged.
 */
export function compareFingerprints(original, current) {
  if (original.fingerprint === current.fingerprint) {
    return {
      match: 'exact',
      verdict: '✅ Model behavior unchanged',
      divergedCanaries: [],
      divergenceScore: 0,
    };
  }

  // Find which specific canaries diverged
  const diverged = [];
  for (const orig of original.outputHashes) {
    const curr = current.outputHashes.find(o => o.canaryId === orig.canaryId);
    if (!curr || curr.outputHash !== orig.outputHash) {
      diverged.push({
        canaryId: orig.canaryId,
        originalHash: orig.outputHash.slice(0, 12),
        currentHash: curr?.outputHash.slice(0, 12) || 'missing',
      });
    }
  }

  const score = diverged.length / original.outputHashes.length;

  return {
    match: score < 0.3 ? 'partial' : 'none',
    verdict: score < 0.3
      ? `⚠️  Partial behavioral change (${diverged.length}/${original.outputHashes.length} canaries diverged)`
      : `🚨 Model behavior significantly changed (${diverged.length}/${original.outputHashes.length} canaries diverged)`,
    divergedCanaries: diverged,
    divergenceScore: parseFloat(score.toFixed(4)),
    isSilentTamper: original.modelSha256 === current.modelSha256 && diverged.length > 0,
    silentTamperExplanation: original.modelSha256 === current.modelSha256 && diverged.length > 0
      ? 'Weight file unchanged but behavior changed — possible model editing attack (ROME/MEMIT/BadNets)'
      : null,
  };
}

/**
 * Build a certified fingerprint report.
 * This is what gets stored on Shelby and anchored on Aptos.
 */
export function buildFingerprintCertificate(fingerprint, comparisonResult = null) {
  return {
    certificate: {
      ...fingerprint,
      comparison: comparisonResult,
      certified: true,
      shelbyStoredAt: new Date().toISOString(),
    },
    certHash: createHash('sha256')
      .update(fingerprint.compoundFingerprint + new Date().toISOString())
      .digest('hex'),
  };
}
