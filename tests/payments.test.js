import { describe, it, expect, afterAll } from 'vitest';
import {
  SHELBYUSD_DECIMALS,
  shelbyUSDToMicro,
  microToShelbyUSD,
  PRICE_TABLE,
  priceFor,
  createPaymentIntent,
  getPaymentIntent,
  markIntentPaid,
  listPaymentIntents,
} from '../lib/payments.js';
import { getDB } from '../lib/kv.js';

describe('lib/payments.js', () => {
  describe('unit conversions (8 decimals)', () => {
    it('converts ShelbyUSD to integer micro-units without float drift', () => {
      expect(shelbyUSDToMicro(1)).toBe(100000000);
      expect(shelbyUSDToMicro(0.0001)).toBe(10000);
      expect(shelbyUSDToMicro(1.5)).toBe(150000000);
      expect(shelbyUSDToMicro(0.01)).toBe(1000000);
    });

    it('round-trips micro to whole ShelbyUSD', () => {
      expect(microToShelbyUSD(shelbyUSDToMicro(0.5))).toBe(0.5);
      expect(microToShelbyUSD(50000000)).toBe(0.5);
    });
  });

  describe('price table', () => {
    it('has a fixed price for every known item', () => {
      for (const item of Object.keys(PRICE_TABLE)) {
        const p = priceFor(item);
        expect(p.usd).toBe(PRICE_TABLE[item]);
        expect(p.micro).toBe(shelbyUSDToMicro(p.usd));
      }
    });

    it('throws for unknown items', () => {
      expect(() => priceFor('free-lunch')).toThrow(/Unknown payment item/);
    });
  });

  describe('intent lifecycle', () => {
    it('creates a pending intent with correct amounts and expiry', async () => {
      const intent = await createPaymentIntent({ item: 'dataset_stream', itemId: 'ds-1', payer: '0xalice', receiver: '0xorg', description: 'stream' });
      expect(intent.status).toBe('pending');
      expect(intent.item).toBe('dataset_stream');
      expect(intent.amountShelbyUSD).toBe(1.5);
      expect(intent.amountMicro).toBe(150000000);
      expect(intent.receiver).toBe('0xorg');
      expect(new Date(intent.expiresAt).getTime() - new Date(intent.createdAt).getTime()).toBe(60 * 60 * 1000);
      expect(await getPaymentIntent(intent.id)).toEqual(intent);
    });

    it('honors an explicit amount override (marketplace listings)', async () => {
      const intent = await createPaymentIntent({ item: 'marketplace_import', itemId: 'listing-9', amountShelbyUSD: 12.5 });
      expect(intent.amountShelbyUSD).toBe(12.5);
      expect(intent.amountMicro).toBe(1250000000);
    });

    it('marks paid exactly once and mints a receipt hash', async () => {
      const intent = await createPaymentIntent({ item: 'inference', itemId: 'm1', payer: '0xalice' });
      const paid = await markIntentPaid(intent.id, { txHash: '0xdead', sender: '0xalice', micropaymentBcs: 'bcs' });
      expect(paid.status).toBe('paid');
      expect(paid.txHash).toBe('0xdead');
      expect(paid.receiptHash).toMatch(/^[0-9a-f]{64}$/);
      expect(paid.paidAt).toBeTruthy();

      // Idempotent: a second settle must not change the receipt.
      const again = await markIntentPaid(intent.id, { txHash: '0xbeef' });
      expect(again.receiptHash).toBe(paid.receiptHash);
      expect(again.txHash).toBe('0xdead');
    });

    it('returns null for unknown intent ids', async () => {
      expect(await getPaymentIntent('nope')).toBeNull();
      expect(await markIntentPaid('nope', {})).toBeNull();
    });

    it('lists only stored intents', async () => {
      const before = (await listPaymentIntents()).length;
      await createPaymentIntent({ item: 'download', itemId: 'm2' });
      const after = (await listPaymentIntents()).length;
      expect(after).toBe(before + 1);
    });

    it('generates unique ids even for identical inputs', async () => {
      const a = await createPaymentIntent({ item: 'inference', itemId: 'm3' });
      const b = await createPaymentIntent({ item: 'inference', itemId: 'm3' });
      expect(a.id).not.toBe(b.id);
    });
  });
});

// Keep the in-memory KV isolated per run: clear keys the tests wrote.
afterAll(async () => {
  const db = getDB();
  const { keys } = await db.list({ prefix: 'pay:' });
  await Promise.all(keys.map(({ name }) => db.del(name)));
});
