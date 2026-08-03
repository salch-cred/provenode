/**
 * #6 — AUTONOMOUS SELF-HEALING FLEET
 * Detects SHA-256 mismatch → fetches clean model from Shelby → auto-heals device.
 * Zero human intervention. On-chain incident log every heal.
 */
import { createHash } from 'node:crypto';

/**
 * Check if a device's reported model SHA matches the registered clean version.
 */
export function detectTamper({ deviceId, reportedSha256, registeredSha256 }) {
  const tampered = reportedSha256 !== registeredSha256;
  return {
    deviceId,
    tampered,
    reportedSha256,
    registeredSha256,
    detectedAt: tampered ? new Date().toISOString() : null,
    severity: tampered ? 'critical' : 'ok',
  };
}

/**
 * Build a heal command to push clean model to device via WebSocket.
 * In production: device SDK listens on WebSocket for HEAL commands.
 */
export function buildHealCommand({ deviceId, modelId, shelbyObjectId, cleanSha256 }) {
  return {
    command: 'HEAL',
    deviceId,
    modelId,
    shelbyObjectId,   // Device fetches this from Shelby
    expectedSha256: cleanSha256,
    token: createHash('sha256')
      .update(`${deviceId}:${modelId}:${cleanSha256}:${process.env.DEPLOY_SECRET || 'dev'}`)
      .digest('hex')
      .slice(0, 24),
    issuedAt: new Date().toISOString(),
    expiresIn: 300, // 5 minutes to complete heal
  };
}

/**
 * Build an on-chain incident record after a heal completes.
 */
export function buildIncidentRecord({
  deviceId, modelId, tamperDetectedAt,
  healedAt, oldSha256, newSha256, shelbyObjectId,
}) {
  return {
    id: createHash('sha256')
      .update(`${deviceId}:${tamperDetectedAt}`)
      .digest('hex')
      .slice(0, 16),
    deviceId,
    modelId,
    type: 'tamper_healed',
    oldSha256,
    newSha256,
    shelbyObjectId,
    tamperDetectedAt,
    healedAt,
    healDurationMs: healedAt && tamperDetectedAt
      ? new Date(healedAt) - new Date(tamperDetectedAt)
      : null,
    status: 'healed',
    autonomous: true,
  };
}

/**
 * Evaluate fleet health from device heartbeats.
 * Returns: healthy count, tampered count, list of devices needing healing.
 */
export function evaluateFleetHealth(devices, models) {
  const modelMap = Object.fromEntries(models.map(m => [m.id, m]));
  const healthy = [];
  const tampered = [];

  for (const device of devices) {
    const model = modelMap[device.modelId];
    if (!model) continue;

    if (device.currentSha256 && device.currentSha256 !== model.sha256) {
      tampered.push({ ...device, expectedSha256: model.sha256 });
    } else {
      healthy.push(device);
    }
  }

  return {
    total: devices.length,
    healthy: healthy.length,
    tampered: tampered.length,
    healthPercent: devices.length > 0
      ? ((healthy.length / devices.length) * 100).toFixed(1)
      : '100',
    needsHealing: tampered,
    evaluatedAt: new Date().toISOString(),
  };
}
