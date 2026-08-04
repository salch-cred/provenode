/**
 * #7 — TRAINING CHECKPOINT STREAMING
 * ═══════════════════════════════════════════════════════════════════
 * Upload training checkpoints to Shelby every N steps.
 * Each checkpoint is an immutable blob — resume from ANY step, anywhere.
 * Shelby's S3 gateway → PyTorch/TF can read checkpoints natively.
 *
 * Why this is novel:
 * - Distributed checkpointing: any node can resume from any saved step
 * - Immutable steps: can't corrupt a checkpoint retroactively
 * - On-chain registry: full training history is auditable
 * - S3-compatible: drop-in for torch.save() / tf.train.Checkpoint
 *
 * On-chain record per checkpoint:
 *   { step, loss, accuracy, shelbyObjectId, parentCheckpointId }
 *
 * Nobody has built this on Shelby.
 */
import { createHash } from 'node:crypto';

/**
 * Build a Shelby blob name for a training checkpoint.
 * Format: checkpoints/{runId}/step-{step:08d}
 */
export function checkpointBlobName(runId, step) {
  const safeRun = runId.replace(/[^a-z0-9\-]/gi, '-').toLowerCase();
  return `checkpoints/${safeRun}/step-${String(step).padStart(8, '0')}`;
}

/**
 * Build a checkpoint record for on-chain registration.
 * Stored in KV + SHA-256 anchored on Aptos.
 */
export function buildCheckpointRecord({
  runId, step, loss, accuracy,
  shelbyObjectId, parentCheckpointId,
  optimizer, hyperparams = {},
}) {
  return {
    id: createHash('sha256')
      .update(`${runId}:step:${step}`)
      .digest('hex')
      .slice(0, 16),
    runId,
    step,
    loss: typeof loss === 'number' ? parseFloat(loss.toFixed(6)) : loss,
    accuracy: typeof accuracy === 'number' ? parseFloat(accuracy.toFixed(6)) : accuracy,
    shelbyObjectId,
    parentCheckpointId: parentCheckpointId || null,
    optimizer: optimizer || 'unknown',
    hyperparams,
    savedAt: new Date().toISOString(),
    // Chain hash: links this checkpoint to the previous one
    chainHash: createHash('sha256')
      .update(`${parentCheckpointId || 'root'}:${shelbyObjectId}:step:${step}`)
      .digest('hex'),
  };
}

/**
 * Verify the integrity of a checkpoint chain.
 * Each checkpoint's chainHash must reference its parent correctly.
 */
export function verifyCheckpointChain(checkpoints) {
  const sorted = [...checkpoints].sort((a, b) => a.step - b.step);
  const results = [];

  for (let i = 0; i < sorted.length; i++) {
    const cp = sorted[i];
    const parent = i > 0 ? sorted[i-1] : null;
    const expectedChainHash = createHash('sha256')
      .update(`${parent ? parent.id : 'root'}:${cp.shelbyObjectId}:step:${cp.step}`)
      .digest('hex');

    results.push({
      step: cp.step,
      id: cp.id,
      chainIntact: expectedChainHash === cp.chainHash,
      loss: cp.loss,
    });
  }

  const allValid = results.every(r => r.chainIntact);
  return {
    valid: allValid,
    totalSteps: checkpoints.length,
    checkpoints: results,
    summary: allValid
      ? `✅ Training chain intact (${checkpoints.length} checkpoints)`
      : `❌ Chain broken at step ${results.find(r => !r.chainIntact)?.step}`,
  };
}

/**
 * Build a PyTorch-compatible resume command.
 * Given a checkpoint, generate the exact command to resume training.
 */
export function buildResumeCommand(checkpoint, shelbyAddress) {
  const downloadUrl = `https://api.testnet.shelby.xyz/shelby/v1/blobs/${shelbyAddress}/${checkpoint.shelbyObjectId.split('/').slice(-2).join('/')}`;
  return {
    curlDownload: `curl -o checkpoint_step${checkpoint.step}.pt "${downloadUrl}"`,
    pytorchResume: `
# Resume training from step ${checkpoint.step}
# Loss at checkpoint: ${checkpoint.loss}
import torch
checkpoint = torch.load("checkpoint_step${checkpoint.step}.pt")
model.load_state_dict(checkpoint['model_state_dict'])
optimizer.load_state_dict(checkpoint['optimizer_state_dict'])
start_epoch = checkpoint['step']
    `.trim(),
    shelbyDownloadUrl: downloadUrl,
    step: checkpoint.step,
    loss: checkpoint.loss,
  };
}
