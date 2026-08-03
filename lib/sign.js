/**
 * Ed25519 Model Signing — api/lib/sign.js
 * Signs model SHA-256 with org private key. Devices verify before loading.
 */
import { createPrivateKey, createPublicKey, createVerify, sign, verify } from 'node:crypto';

/** Sign a SHA-256 hex string with the org Ed25519 key (from SHELBY_PRIVATE_KEY or SIGN_KEY) */
export async function signModel(sha256Hex) {
  const rawKey = process.env.SIGN_KEY || process.env.SHELBY_PRIVATE_KEY;
  if (!rawKey) return null;

  try {
    // Convert Aptos hex private key to Node.js crypto Ed25519
    const keyBytes = Buffer.from(rawKey.replace('0x','').slice(0, 64), 'hex');
    const privateKey = createPrivateKey({
      key: Buffer.concat([
        Buffer.from('302e020100300506032b657004220420', 'hex'),
        keyBytes,
      ]),
      format: 'der',
      type: 'pkcs8',
    });

    const msgBuffer = Buffer.from(sha256Hex, 'utf8');
    const signature = sign(null, msgBuffer, privateKey);
    return {
      signature: signature.toString('hex'),
      algorithm: 'ed25519',
      signedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/** Verify a signature. Returns true/false */
export function verifySignature(sha256Hex, signatureHex, publicKeyHex) {
  try {
    const pubKeyBytes = Buffer.from(publicKeyHex.replace('0x',''), 'hex');
    // FIX C-2: Use createPublicKey (not createPrivateKey) for SPKI public key
    const publicKey = createPublicKey({
      key: Buffer.concat([
        Buffer.from('302a300506032b6570032100', 'hex'),
        pubKeyBytes,
      ]),
      format: 'der',
      type: 'spki',
    });

    return verify(
      null,
      Buffer.from(sha256Hex, 'utf8'),
      publicKey,
      Buffer.from(signatureHex, 'hex'),
    );
  } catch {
    return false;
  }
}
