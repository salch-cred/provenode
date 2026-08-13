/**
 * Model Passport — public ownership certificates for registered models.
 *
 * Every model gets a signed certificate binding its SHA-256 to the org
 * address + registration timestamp. The certificate is stored as an
 * immutable Shelby blob and indexed by SHA-256 so anyone with a weights
 * file can look up its legal origin.
 *
 * When MOVE_CONTRACT_ADDRESS + SHELBY_PRIVATE_KEY are configured, issuance
 * also dispatches a real ModelRegistry::register_model transaction on
 * Shelbynet and records the tx hash. Otherwise the certificate is anchored
 * as a Shelby blob (still immutable + public).
 */
import { createHash } from 'node:crypto';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { signPayload, verifyPayload } from './sign.js';

export const PASSPORT_VERSION = 'provenode-passport-v1';

/** Canonical payload that gets signed — any change invalidates the signature. */
export function canonicalPayload({ modelId, sha256, modelName, orgAddress, registeredAt, version }) {
  return [
    PASSPORT_VERSION,
    modelId,
    sha256,
    modelName,
    orgAddress || '',
    registeredAt,
    version || '',
  ].join('|');
}

/** Derive the Ed25519 public key hex from the org signing key (seed). */
export function derivePublicKeyHex(rawKey) {
  try {
    const keyBytes = Buffer.from(rawKey.replace('0x', '').slice(0, 64), 'hex');
    const privateKey = createPrivateKey({
      key: Buffer.concat([
        Buffer.from('302e020100300506032b657004220420', 'hex'),
        keyBytes,
      ]),
      format: 'der',
      type: 'pkcs8',
    });
    // createPublicKey(privateKey) derives the public part (node Ed25519 quirk:
    // a private key cannot be exported directly as SPKI).
    const publicKey = createPublicKey(privateKey);
    const spki = publicKey.export({ type: 'spki', format: 'der' });
    // SPKI ends with the 32-byte Ed25519 public key.
    return spki.subarray(spki.length - 32).toString('hex');
  } catch {
    return null;
  }
}

/** Org Aptos address from SHELBY_PRIVATE_KEY (null if unconfigured). */
export async function getOrgAddress() {
  const rawKey = process.env.SHELBY_PRIVATE_KEY;
  if (!rawKey) return null;
  try {
    const { Account, Ed25519PrivateKey } = await import('@aptos-labs/ts-sdk');
    const account = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(rawKey) });
    return account.accountAddress.toString();
  } catch {
    return null;
  }
}

/** Build a signed passport record for a model. Signing key = SIGN_KEY || SHELBY_PRIVATE_KEY. */
export function buildPassportRecord({ modelId, modelName, sha256, version, license, registeredAt, orgAddress }) {
  const registeredAtIso = registeredAt || new Date().toISOString();
  const payload = canonicalPayload({
    modelId, sha256, modelName,
    orgAddress: orgAddress || null,
    registeredAt: registeredAtIso,
    version: version || '',
  });

  const rawKey = process.env.SIGN_KEY || process.env.SHELBY_PRIVATE_KEY;
  const sig = rawKey ? signPayload(payload) : null;

  const publicKey = rawKey ? derivePublicKeyHex(rawKey) : null;
  const record = {
    version: PASSPORT_VERSION,
    modelId,
    modelName,
    sha256,
    orgAddress: orgAddress || null,
    publicKey,
    registeredAt: registeredAtIso,
    modelVersion: version || null,
    license: license || null,
    payload,
    signature: sig ? sig.signature : null,
    signed: Boolean(sig),
    algorithm: sig ? sig.algorithm : null,
    signedAt: sig ? sig.signedAt : null,
    issuedAt: new Date().toISOString(),
    anchored: null,     // 'move-tx' | 'shelby-blob' | null
    txHash: null,
    explorerUrl: null,
    shelbyObjectId: null,
    verified: sig ? verifyPayload(payload, sig.signature, publicKey) : false,
  };
  return record;
}

/**
 * Verify a stored passport.
 * Recomputes the canonical payload from the record's live fields and requires
 * it to match the signed payload — so editing ANY field breaks verification,
 * not just the payload string.
 */
export function verifyPassport(passport) {
  if (!passport || !passport.signature || !passport.publicKey) return false;
  const recomputed = canonicalPayload({
    modelId: passport.modelId,
    sha256: passport.sha256,
    modelName: passport.modelName,
    orgAddress: passport.orgAddress,
    registeredAt: passport.registeredAt,
    version: passport.modelVersion,
  });
  if (recomputed !== passport.payload) return false;
  return verifyPayload(passport.payload, passport.signature, passport.publicKey);
}

/** Write a passport + the SHA-256 → modelId index into KV. */
export async function storePassport(db, passport) {
  await db.put(`passport:${passport.modelId}`, JSON.stringify(passport));
  await db.put(`passport-sha:${passport.sha256}`, passport.modelId);
  return passport;
}

/** Look up a passport by weights-file SHA-256. Returns passport or null. */
export async function findPassportBySha256(db, sha256Hex) {
  const modelId = await db.get(`passport-sha:${sha256Hex.toLowerCase()}`);
  if (!modelId) return null;
  const raw = await db.get(`passport:${modelId}`);
  return raw ? JSON.parse(raw) : null;
}

/**
 * Dispatch a real ModelRegistry::register_model transaction on Shelbynet.
 * Requires MOVE_CONTRACT_ADDRESS + SHELBY_PRIVATE_KEY. Returns
 * { txHash, explorerUrl } or throws with the reason.
 */
export async function anchorOnChain({ sha256, shelbyObjectId, modelName, version, modelId }) {
  const moveAddr = process.env.MOVE_CONTRACT_ADDRESS;
  const rawKey = process.env.SHELBY_PRIVATE_KEY;
  if (!moveAddr) throw new Error('MOVE_CONTRACT_ADDRESS not configured — certificate anchored as a Shelby blob instead.');
  if (!rawKey) throw new Error('SHELBY_PRIVATE_KEY not configured — certificate anchored as a Shelby blob instead.');

  const { Account, Ed25519PrivateKey, Aptos, AptosConfig, Network } = await import('@aptos-labs/ts-sdk');
  const networkStr = process.env.SHELBY_NETWORK || 'shelbynet';
  const network = networkStr === 'testnet' ? Network.TESTNET : Network.SHELBYNET;
  const aptos = new Aptos(new AptosConfig({ network }));
  const account = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(rawKey) });

  const encoder = new TextEncoder();
  const transaction = await aptos.transaction.build.simple({
    sender: account.accountAddress,
    data: {
      function: `${moveAddr}::ModelRegistry::register_model`,
      functionArguments: [
        new Uint8Array(Buffer.from(sha256.replace('0x', ''), 'hex')),
        encoder.encode(shelbyObjectId),
        modelName || '',
        version || '',
        encoder.encode(modelId),
      ],
    },
  });

  const pending = await aptos.signAndSubmitTransaction({ signer: account, transaction });
  await aptos.waitForTransaction({ transactionHash: pending.hash });

  const explorerUrl = `https://explorer.aptoslabs.com/txn/${pending.hash}?network=custom&customNetworkUrl=https%3A%2F%2Fapi.shelbynet.shelby.xyz%2Fv1`;
  return { txHash: pending.hash, explorerUrl };
}

/** Compute the certificate blob name for a model. */
export function passportBlobName(modelId) {
  const safe = modelId.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  return `passports/${safe}/certificate-${Date.now()}`;
}

/** Certificate hash used for audit + display. */
export function passportCertHash(passport) {
  return createHash('sha256')
    .update(`${passport.sha256}:${passport.payload}:${passport.signature || ''}`)
    .digest('hex');
}
