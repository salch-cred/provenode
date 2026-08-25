import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { AccountAddress, Ed25519Account, Ed25519PrivateKey } from '@aptos-labs/ts-sdk';
import handler from '../api/index.js';
import { getDB } from '../lib/kv.js';

// ── Mocks ────────────────────────────────────────────────────────────────────
// The on-chain settle step never touches a real network in tests.
vi.mock('@shelby-protocol/sdk/node', async (importOriginal) => {
  const actual = await importOriginal();
  class FakeChannelClient {
    async receiverWithdraw() { return { transaction: { hash: '0xfake-settle-tx' } }; }
  }
  return { ...actual, ShelbyMicropaymentChannelClient: FakeChannelClient };
});

// Blob fetch is mocked so paid downloads can stream without network access.
vi.mock('../lib/shelby.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    shelbyDownloadBlob: async () => ({ buffer: Buffer.from('paid-blob-bytes') }),
  };
});

// ── Vercel-style fake req/res (same harness as api.test.js) ─────────────────
let seq = 0;
function makeReq({ method = 'GET', path = '/api/health', query = {}, body, headers = {} } = {}) {
  seq += 1;
  return {
    method,
    url: path,
    headers: {
      'x-forwarded-for': `203.0.113.${(seq % 250) + 1}`, // avoid the 30/10s rate limit
      ...headers,
    },
    query,
    body,
    [Symbol.asyncIterator]: async function* () {
      if (body !== undefined) yield Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    },
  };
}

function makeRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    ended: false,
    setHeader(k, v) { this.headers[k] = v; },
    getHeader(k) { return this.headers[k]; },
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; this.ended = true; },
    send(body) { this.body = body; this.ended = true; },
    end(body) { if (body !== undefined) this.body = body; this.ended = true; },
  };
  return res;
}

async function api(method, path, { query = {}, body, headers = {} } = {}) {
  const req = makeReq({ method, path, query, body, headers });
  const res = makeRes();
  await handler(req, res);
  return { status: res.statusCode, body: res.body, headers: res.headers };
}

// ── Test fixtures ────────────────────────────────────────────────────────────
const SECRET = 'test-deploy-secret';
const TEST_KEY = `ed25519-priv-0x${'11'.repeat(32)}`;
const SENDER_ADDR = `0x${'a1'.repeat(32)}`;
const OTHER_RECEIVER = `0x${'b2'.repeat(32)}`;
const DEPLOYER_ADDR = `0x${'c3'.repeat(32)}`;
let orgAddress;

async function seedModel(overrides = {}) {
  const db = getDB();
  const model = {
    id: `paywall-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    model: 'Paywall Model',
    objectId: 'seed-object',
    sha256: createHash('sha256').update('paid-blob-bytes').digest('hex'),
    size: 15,
    mode: 'shelby',
    address: '0xseed',
    blobName: 'seed/paywall-model',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
  await db.put(`model:${model.id}`, JSON.stringify(model));
  return model;
}

/** Build a BCS-hex SenderBuiltMicropayment with the real SDK classes. */
async function buildMicropayment({ receiver, amountMicro }) {
  const { SenderBuiltMicropayment, SHELBYUSD_FA_METADATA_ADDRESS } = await import('@shelby-protocol/sdk/node');
  const mp = new SenderBuiltMicropayment(
    AccountAddress.fromString(SENDER_ADDR),
    AccountAddress.fromString(receiver),
    1n,
    BigInt(amountMicro),
    AccountAddress.fromString(SHELBYUSD_FA_METADATA_ADDRESS),
    1n,
    new Uint8Array(32).fill(1),
    new Uint8Array(64).fill(2),
    AccountAddress.fromString(DEPLOYER_ADDR),
  );
  return mp.bcsToHex().toString();
}

beforeAll(async () => {
  process.env.DEPLOY_SECRET = SECRET;
  process.env.SHELBY_PRIVATE_KEY = TEST_KEY;
  process.env.SHELBY_API_KEY = 'AG-test-key';
  process.env.SIGN_KEY = 'a'.repeat(64);
  orgAddress = new Ed25519Account({ privateKey: new Ed25519PrivateKey(TEST_KEY) }).accountAddress.toString();
});

afterAll(() => {
  delete process.env.DEPLOY_SECRET;
  delete process.env.SHELBY_PRIVATE_KEY;
  delete process.env.SHELBY_API_KEY;
  delete process.env.SIGN_KEY;
  delete process.env.PAYWALL_MODE;
});

describe('x402 pay-per-read: GET /api/objects/:id/blob', () => {
  it('returns a 402 quote with payment requirements for unauthenticated callers', async () => {
    const model = await seedModel();
    const res = await api('GET', `/api/objects/${model.id}/blob`);
    expect(res.status).toBe(402);
    expect(res.body.x402.scheme).toBe('shelby-micropayment');
    expect(res.body.x402.intentId).toBeTruthy();
    expect(res.body.x402.amountShelbyUSD).toBe(0.0001); // PRICE_TABLE.download
    expect(res.body.x402.amountMicro).toBe(10000);
    expect(res.body.x402.receiver).toBe(orgAddress);
    expect(res.body.x402.token.faMetadataAddress).toBeTruthy();
    expect(res.body.x402.pay.header).toBe('X-Payment');
  });

  it('reuses the same pending intent on repeat quotes (idempotent)', async () => {
    const model = await seedModel();
    const first = await api('GET', `/api/objects/${model.id}/blob`);
    const second = await api('GET', `/api/objects/${model.id}/blob`);
    expect(first.status).toBe(402);
    expect(second.status).toBe(402);
    expect(second.body.x402.intentId).toBe(first.body.x402.intentId);
  });

  it('rejects garbage payment payloads with 400', async () => {
    const model = await seedModel();
    await api('GET', `/api/objects/${model.id}/blob`); // create the quote first
    const res = await api('GET', `/api/objects/${model.id}/blob`, { headers: { 'x-payment': 'deadbeef' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid micropayment BCS/i);
  });

  it('rejects micropayments addressed to a different receiver with 400', async () => {
    const model = await seedModel();
    await api('GET', `/api/objects/${model.id}/blob`);
    const bcs = await buildMicropayment({ receiver: OTHER_RECEIVER, amountMicro: 10000 });
    const res = await api('GET', `/api/objects/${model.id}/blob`, { headers: { 'x-payment': bcs } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/receiver does not match/i);
  });

  it('rejects underpaying micropayments with a 402 shortfall', async () => {
    const model = await seedModel();
    await api('GET', `/api/objects/${model.id}/blob`);
    const bcs = await buildMicropayment({ receiver: orgAddress, amountMicro: 1 });
    const res = await api('GET', `/api/objects/${model.id}/blob`, { headers: { 'x-payment': bcs } });
    expect(res.status).toBe(402);
    expect(res.body.requiredMicro).toBe(10000);
    expect(res.body.paidMicro).toBe(1);
  });

  it('settles a full micropayment, streams the blob, and returns a receipt', async () => {
    const model = await seedModel();
    const quote = await api('GET', `/api/objects/${model.id}/blob`);
    const intentId = quote.body.x402.intentId;
    const bcs = await buildMicropayment({ receiver: orgAddress, amountMicro: 10000 });
    const res = await api('GET', `/api/objects/${model.id}/blob`, { headers: { 'x-payment': bcs, 'x-payment-intent': intentId } });
    expect(res.status).toBe(200);
    expect(res.body.toString()).toBe('paid-blob-bytes');
    const receipt = JSON.parse(Buffer.from(res.headers['X-Payment-Response'], 'base64').toString());
    expect(receipt.intentId).toBe(intentId);
    expect(receipt.txHash).toBe('0xfake-settle-tx');
    expect(receipt.receiptHash).toBeTruthy();

    const { getPaymentIntent } = await import('../lib/payments.js');
    const intent = await getPaymentIntent(intentId);
    expect(intent.status).toBe('paid');
    expect(intent.txHash).toBe('0xfake-settle-tx');
  });

  it('replays after settlement are free and still return the receipt', async () => {
    const model = await seedModel();
    const quote = await api('GET', `/api/objects/${model.id}/blob`);
    const intentId = quote.body.x402.intentId;
    const bcs = await buildMicropayment({ receiver: orgAddress, amountMicro: 10000 });
    const first = await api('GET', `/api/objects/${model.id}/blob`, { headers: { 'x-payment': bcs, 'x-payment-intent': intentId } });
    expect(first.status).toBe(200);
    const replay = await api('GET', `/api/objects/${model.id}/blob`, { headers: { 'x-payment': bcs, 'x-payment-intent': intentId } });
    expect(replay.status).toBe(200);
    expect(replay.body.toString()).toBe('paid-blob-bytes');
    const receipt = JSON.parse(Buffer.from(replay.headers['X-Payment-Response'], 'base64').toString());
    expect(receipt.txHash).toBe('0xfake-settle-tx');
  });

  it('admin token downloads free without payment', async () => {
    const model = await seedModel();
    const res = await api('GET', `/api/objects/${model.id}/blob`, { headers: { 'x-provenode-token': SECRET } });
    expect(res.status).toBe(200);
    expect(res.body.toString()).toBe('paid-blob-bytes');
    expect(res.headers['X-Payment-Response']).toBeUndefined();
  });

  it('PAYWALL_MODE=off restores the auth-only behavior (401 for strangers)', async () => {
    process.env.PAYWALL_MODE = 'off';
    try {
      const model = await seedModel();
      const res = await api('GET', `/api/objects/${model.id}/blob`);
      expect(res.status).toBe(401);
    } finally {
      delete process.env.PAYWALL_MODE;
    }
  });
});
