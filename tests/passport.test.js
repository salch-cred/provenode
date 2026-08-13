import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  PASSPORT_VERSION,
  canonicalPayload,
  buildPassportRecord,
  verifyPassport,
  derivePublicKeyHex,
  passportBlobName,
  passportCertHash,
  storePassport,
  findPassportBySha256,
  anchorOnChain,
} from '../lib/passport.js';
import { getDB } from '../lib/kv.js';

// Deterministic Ed25519 seed used across tests.
const TEST_KEY = 'a'.repeat(64);
const SHA = 'f'.repeat(64);

describe('lib/passport.js', () => {
  describe('canonicalPayload', () => {
    it('is stable for identical inputs and order-sensitive', () => {
      const a = canonicalPayload({ modelId: 'm1', sha256: SHA, modelName: 'Model', orgAddress: '0x1', registeredAt: '2026-01-01T00:00:00Z', version: '1.0' });
      const b = canonicalPayload({ modelId: 'm1', sha256: SHA, modelName: 'Model', orgAddress: '0x1', registeredAt: '2026-01-01T00:00:00Z', version: '1.0' });
      expect(a).toBe(b);
      const c = canonicalPayload({ modelId: 'm2', sha256: SHA, modelName: 'Model', orgAddress: '0x1', registeredAt: '2026-01-01T00:00:00Z', version: '1.0' });
      expect(a).not.toBe(c);
    });

    it('includes the passport version as the first field', () => {
      const p = canonicalPayload({ modelId: 'm1', sha256: SHA, modelName: 'M' });
      expect(p.startsWith(PASSPORT_VERSION)).toBe(true);
    });
  });

  describe('derivePublicKeyHex', () => {
    it('derives a 64-char hex public key from a valid Ed25519 seed', () => {
      const pk = derivePublicKeyHex(TEST_KEY);
      expect(pk).toMatch(/^[0-9a-f]{64}$/);
    });

    it('returns null for invalid keys', () => {
      expect(derivePublicKeyHex('zz-not-hex')).toBeNull();
      expect(derivePublicKeyHex('')).toBeNull();
    });
  });

  describe('buildPassportRecord / verifyPassport', () => {
    beforeAll(() => { process.env.SIGN_KEY = TEST_KEY; });
    afterAll(() => { delete process.env.SIGN_KEY; });

    it('produces a signed, self-verifying certificate', () => {
      const rec = buildPassportRecord({ modelId: 'm1', modelName: 'Model', sha256: SHA, version: '2.1', license: 'MIT', registeredAt: '2026-01-01T00:00:00Z', orgAddress: '0xabc' });
      expect(rec.signed).toBe(true);
      expect(rec.signature).toBeTruthy();
      expect(rec.publicKey).toMatch(/^[0-9a-f]{64}$/);
      expect(rec.algorithm).toBe('ed25519');
      expect(rec.verified).toBe(true);
      expect(verifyPassport(rec)).toBe(true);
    });

    it('rejects tampering of EVERY signed field', () => {
      const rec = buildPassportRecord({ modelId: 'm1', modelName: 'Model', sha256: SHA, version: '1.0', registeredAt: '2026-01-01T00:00:00Z', orgAddress: '0xabc' });
      const tampered = [
        ['modelId', 'm-evil'],
        ['sha256', 'e'.repeat(64)],
        ['modelName', 'Evil Model'],
        ['orgAddress', '0xdeadbeef'],
        ['registeredAt', '2026-02-02T00:00:00Z'],
        ['modelVersion', '9.9.9'],
      ];
      for (const [field, value] of tampered) {
        const clone = { ...rec, [field]: value };
        expect(verifyPassport(clone), `field ${field}`).toBe(false);
      }
    });

    it('rejects a swapped signature or public key', () => {
      const rec = buildPassportRecord({ modelId: 'm1', modelName: 'Model', sha256: SHA });
      // Second record signed with a DIFFERENT key (b…): same fields, different signer.
      process.env.SIGN_KEY = 'b'.repeat(64);
      const other = buildPassportRecord({ modelId: 'm1', modelName: 'Model', sha256: SHA });
      process.env.SIGN_KEY = 'a'.repeat(64);
      expect(other.publicKey).not.toBe(rec.publicKey);
      expect(verifyPassport({ ...rec, signature: other.signature })).toBe(false);
      expect(verifyPassport({ ...rec, publicKey: other.publicKey })).toBe(false);
    });

    it('returns unsigned records when no signing key is configured', () => {
      delete process.env.SIGN_KEY;
      const rec = buildPassportRecord({ modelId: 'm1', modelName: 'Model', sha256: SHA });
      expect(rec.signed).toBe(false);
      expect(rec.signature).toBeNull();
      expect(verifyPassport(rec)).toBe(false);
      process.env.SIGN_KEY = TEST_KEY;
    });
  });

  describe('KV indexing', () => {
    it('stores and finds a passport by SHA-256', async () => {
      const db = getDB();
      const rec = buildPassportRecord({ modelId: 'm-index-1', modelName: 'Idx', sha256: SHA, registeredAt: '2026-01-01T00:00:00Z' });
      await storePassport(db, rec);
      const found = await findPassportBySha256(db, SHA.toUpperCase()); // case-insensitive
      expect(found).not.toBeNull();
      expect(found.modelId).toBe('m-index-1');
      expect(await findPassportBySha256(db, '1'.repeat(64))).toBeNull();
    });
  });

  describe('helpers', () => {
    it('sanitizes model ids into blob names', () => {
      expect(passportBlobName('My Model/1')).toMatch(/^passports\/my-model-1\/certificate-\d+$/);
    });

    it('computes a stable certificate hash', () => {
      const rec = buildPassportRecord({ modelId: 'm1', modelName: 'Model', sha256: SHA });
      const changed = buildPassportRecord({ modelId: 'm1', modelName: 'Changed', sha256: SHA });
      const h1 = passportCertHash(rec);
      const h2 = passportCertHash(changed);
      expect(h1).toMatch(/^[0-9a-f]{64}$/);
      expect(h1).not.toBe(h2);
      expect(passportCertHash(rec)).toBe(h1); // stable across calls
    });
  });

  describe('anchorOnChain', () => {
    it('fails cleanly without MOVE_CONTRACT_ADDRESS', async () => {
      const prev = process.env.MOVE_CONTRACT_ADDRESS;
      delete process.env.MOVE_CONTRACT_ADDRESS;
      await expect(anchorOnChain({ sha256: SHA, shelbyObjectId: 'obj', modelName: 'M', version: '1', modelId: 'm1' }))
        .rejects.toThrow('MOVE_CONTRACT_ADDRESS not configured');
      if (prev) process.env.MOVE_CONTRACT_ADDRESS = prev;
    });
  });
});
