/**
 * Ed25519 Model Signing — api/lib/sign.js
 * Signs model SHA-256 with org private key. Devices verify before loading.
 */
import { createPrivateKey, createPublicKey, createVerify, sign, verify } from 'node:crypto';

/** Build a Node crypto Ed25519 private key from an Aptos hex private key. */
function ed25519PrivateKey(rawKey) {
  const keyBytes = Buffer.from(rawKey.replace('0x','').slice(0, 64), 'hex');
  return createPrivateKey({
    key: Buffer.concat([
      Buffer.from('302e020100300506032b657004220420', 'hex'),
      keyBytes,
    ]),
    format: 'der',
    type: 'pkcs8',
  });
}

/** Build a Node crypto Ed25519 public key from hex public key bytes. */
function ed25519PublicKey(publicKeyHex) {
  const pubKeyBytes = Buffer.from(publicKeyHex.replace('0x',''), 'hex');
  return createPublicKey({
    key: Buffer.concat([
      Buffer.from('302a300506032b6570032100', 'hex'),
      pubKeyBytes,
    ]),
    format: 'der',
    type: 'spki',
  });
}

/**
 * Sign an arbitrary payload string with the org Ed25519 key
 * (from SHELBY_PRIVATE_KEY or SIGN_KEY). Returns null if unconfigured.
 */
export function signPayload(payloadString) {
  const rawKey = process.env.SIGN_KEY || process.env.SHELBY_PRIVATE_KEY;
  if (!rawKey) return null;
  try {
    const privateKey = ed25519PrivateKey(rawKey);
    return {
      signature: sign(null, Buffer.from(payloadString, 'utf8'), privateKey).toString('hex'),
      algorithm: 'ed25519',
      signedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/** Verify a signature over an arbitrary payload. Returns true/false. */
export function verifyPayload(payloadString, signatureHex, publicKeyHex) {
  try {
    return verify(
      null,
      Buffer.from(payloadString, 'utf8'),
      ed25519PublicKey(publicKeyHex),
      Buffer.from(signatureHex, 'hex'),
    );
  } catch {
    return false;
  }
}

/** Sign a SHA-256 hex string with the org Ed25519 key (from SHELBY_PRIVATE_KEY or SIGN_KEY) */
export async function signModel(sha256Hex) {
  return signPayload(sha256Hex);
}

/** Verify a signature. Returns true/false */
export function verifySignature(sha256Hex, signatureHex, publicKeyHex) {
  return verifyPayload(sha256Hex, signatureHex, publicKeyHex);
}
