import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Readable } from 'node:stream';
import handler from '../api/index.js';
import { getDB } from '../lib/kv.js';

// ── Vercel-style fake req/res ────────────────────────────────────────────
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
    body, // pre-parsed body (readBody returns it directly)
    // async iterable fallback used by readBody for raw bodies
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
    end() { this.ended = true; },
  };
  return res;
}

async function api(method, path, { query = {}, body, headers = {}, raw } = {}) {
  const req = makeReq({ method, path, query, body, headers });
  const res = makeRes();
  await handler(req, res);
  return { status: res.statusCode, body: res.body, headers: res.headers };
}

// ── Seed helpers ─────────────────────────────────────────────────────────
async function seedModel(overrides = {}) {
  const db = getDB();
  const model = {
    id: `test-model-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    model: 'Test Model',
    objectId: 'seed-object',
    sha256: 'a'.repeat(64),
    size: 1234,
    mode: 'shelby',
    address: '0xseed',
    blobName: 'seed/model-1',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
  await db.put(`model:${model.id}`, JSON.stringify(model));
  return model;
}

beforeAll(() => { process.env.SIGN_KEY = 'a'.repeat(64); });
afterAll(() => { delete process.env.SIGN_KEY; });

describe('GET /api/health', () => {
  it('reports ok with service + version', async () => {
    const { status, body } = await api('GET', '/api/health');
    expect(status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('provenode');
  });
});

describe('GET /api/config', () => {
  it('defaults to shelbynet (real network) — never testnet', async () => {
    const { status, body } = await api('GET', '/api/config');
    expect(status).toBe(200);
    expect(body.network).toBe('shelbynet');
    expect(body.shelbyApiUrl).toBe('https://api.shelbynet.shelby.xyz/v1');
    expect(body.features.lineage).toBe(true);
  });
});

describe('GET /api/models', () => {
  it('lists registered models with public fields only', async () => {
    const model = await seedModel();
    const { status, body } = await api('GET', '/api/models');
    expect(status).toBe(200);
    const found = body.models.find((m) => m.id === model.id);
    expect(found).toBeTruthy();
    expect(found.sha256).toBe('a'.repeat(64));
    expect(found).not.toHaveProperty('signature'); // private field stripped
  });
});

describe('Model Passport routes', () => {
  it('issues a passport, reads it back, and verifies it', async () => {
    const model = await seedModel();
    const issued = await api('POST', '/api/passport', { body: { modelId: model.id } });
    expect(issued.status).toBe(201);
    expect(issued.body.success).toBe(true);
    expect(issued.body.passport.signed).toBe(true);
    expect(issued.body.passport.verified).toBe(true);

    const got = await api('GET', `/api/passport/${model.id}`);
    expect(got.status).toBe(200);
    expect(got.body.verified).toBe(true);
    expect(got.body.passport.modelId).toBe(model.id);
    expect(got.body.passport.signature).toBeUndefined(); // never expose the sig
  });

  it('auto-indexes by SHA-256 and exact-matches on passport check', async () => {
    const model = await seedModel();
    await api('POST', '/api/passport', { body: { modelId: model.id } });
    const check = await api('POST', '/api/passport/check', { body: { sha256: 'a'.repeat(64) } });
    expect(check.status).toBe(200);
    expect(check.body.match).toBe('exact');
    expect(check.body.verified).toBe(true);
  });

  it('reports no-match for unregistered weights files', async () => {
    const check = await api('POST', '/api/passport/check', { body: { sha256: 'f'.repeat(64) } });
    expect(check.status).toBe(200);
    expect(check.body.match).toBe('none');
    expect(Array.isArray(check.body.registeredModels)).toBe(true);
  });

  it('rejects malformed passport checks', async () => {
    const bad = await api('POST', '/api/passport/check', { body: { sha256: 'zzz' } });
    expect(bad.status).toBe(400);
    const missing = await api('POST', '/api/passport/check', { body: {} });
    expect(missing.status).toBe(400);
  });

  it('404s when no passport exists for a model', async () => {
    const res = await api('GET', '/api/passport/ghost-model');
    expect(res.status).toBe(404);
  });
});

describe('Payment routes', () => {
  it('creates a marketplace-import intent priced from the listing', async () => {
    const db = getDB();
    const listing = {
      id: `seed-listing-${Date.now()}`,
      modelId: 'seed-model-1',
      name: 'Listed',
      price: 2.5,
      sha256: 'a'.repeat(64),
      shelbyObjectId: 'seed-object',
      size: 1234,
      mode: 'shelby',
      createdAt: new Date().toISOString(),
    };
    await db.put(`marketplace:${listing.id}`, JSON.stringify(listing));
    const res = await api('POST', '/api/payments', { body: { item: 'marketplace_import', itemId: listing.id } });
    expect(res.status).toBe(201);
    expect(res.body.intent.amountShelbyUSD).toBe(2.5);
    expect(res.body.intent.amountMicro).toBe(250000000);
    expect(res.body.payment.tokenAddress).toBeTruthy();
  });

  it('prices a free listing at the platform fee', async () => {
    const db = getDB();
    const listing = {
      id: `free-listing-${Date.now()}`,
      modelId: 'seed-model-1',
      name: 'Free',
      price: 0,
      sha256: 'a'.repeat(64),
      shelbyObjectId: 'seed-object',
      size: 1234,
      mode: 'shelby',
      createdAt: new Date().toISOString(),
    };
    await db.put(`marketplace:${listing.id}`, JSON.stringify(listing));
    const res = await api('POST', '/api/payments', { body: { item: 'marketplace_import', itemId: listing.id } });
    expect(res.status).toBe(201);
    expect(res.body.intent.amountShelbyUSD).toBe(0.01);
  });

  it('rejects settlement without Shelby credentials (clean 503, no fabrication)', async () => {
    const db = getDB();
    const { createPaymentIntent } = await import('../lib/payments.js');
    const intent = await createPaymentIntent({ item: 'dataset_stream', itemId: 'ds-x' });
    const res = await api('POST', '/api/payments', {
      body: { action: 'verify', intentId: intent.id, micropaymentBcs: 'deadbeef' },
    });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/SHELBY_PRIVATE_KEY and SHELBY_API_KEY required/);
  });
});

describe('Deploy route (real mode)', () => {
  it('requires a registered model', async () => {
    const res = await api('POST', '/api/deploy', { body: { modelName: 'Nope', version: '1' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Real mode requires a registered model/);
  });
});

describe('Auth guard', () => {
  it('rejects mutating routes without the token when DEPLOY_SECRET is set', async () => {
    process.env.DEPLOY_SECRET = 'secret-test';
    const res = await api('POST', '/api/passport', { body: { modelId: 'x' } });
    expect(res.status).toBe(401);
    delete process.env.DEPLOY_SECRET;
  });
});

describe('Agent (AI bot) endpoint', () => {
  it('is public (no token needed) and fails cleanly when MISTRAL_API_KEY is missing', async () => {
    process.env.DEPLOY_SECRET = 'secret-test';
    delete process.env.MISTRAL_API_KEY;
    const res = await api('POST', '/api/agent', { body: { message: 'status' } });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/MISTRAL_API_KEY not configured/);
    delete process.env.DEPLOY_SECRET;
  });

  it('grounds answers in real platform state via tool calls', async () => {
    const db = getDB();
    await db.put('model:tool-test', JSON.stringify({ id: 'tool-test', model: 'EdgeVision v3', sha256: 'c'.repeat(64), size: 2048, mode: 'shelby', createdAt: new Date().toISOString() }));
    await db.put('deployment:tool-dep', JSON.stringify({ id: 'tool-dep', model: 'EdgeVision v3', version: '3.1', status: 'verified', progress: 100, region: 'Global', createdAt: new Date().toISOString() }));

    process.env.MISTRAL_API_KEY = 'test-key';
    process.env.DEPLOY_SECRET = 'secret-test';

    const origFetch = globalThis.fetch;
    let calls = 0;
    try {
      globalThis.fetch = async (url, opts) => {
        const payload = JSON.parse(opts.body);
        expect(url).toBe('https://api.mistral.ai/v1/chat/completions');
        expect(payload.tools.length).toBeGreaterThanOrEqual(4);
        expect(payload.tool_choice).toBe('auto');
        calls += 1;
        if (calls === 1) {
          // Model asks for real data instead of hallucinating.
          return {
            ok: true, status: 200,
            json: async () => ({
              choices: [{ message: {
                role: 'assistant', content: null,
                tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'list_models', arguments: '{}' } }],
              } }],
            }),
          };
        }
        // Second call carries the tool result with the seeded model.
        const toolMsg = payload.messages.find(m => m.role === 'tool');
        expect(toolMsg).toBeTruthy();
        expect(toolMsg.content).toContain('EdgeVision v3');
        return {
          ok: true, status: 200,
          json: async () => ({
            choices: [{ message: { role: 'assistant', content: 'There is 1 registered model: EdgeVision v3.' } }],
          }),
        };
      };

      const res = await api('POST', '/api/agent', { body: { message: 'Which models are registered?' } });
      expect(res.status).toBe(200);
      expect(res.body.response).toContain('EdgeVision v3');
      expect(calls).toBe(2);
    } finally {
      globalThis.fetch = origFetch;
      delete process.env.MISTRAL_API_KEY;
      delete process.env.DEPLOY_SECRET;
    }
  });
});

describe('Fingerprint route', () => {
  it('rejects malformed outputs[] entries with a clean 400 instead of crashing', async () => {
    const db = getDB();
    await db.put('model:fp-model', JSON.stringify({ id: 'fp-model', model: 'FPM', sha256: 'd'.repeat(64), size: 1, mode: 'shelby', createdAt: new Date().toISOString() }));
    const res = await api('POST', '/api/fingerprint', { body: { modelId: 'fp-model', outputs: ['abc', 'abd'] } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/canaryId and output/);
  });

  it('creates a fingerprint from well-formed canary outputs', async () => {
    const res = await api('POST', '/api/fingerprint', { body: { modelId: 'fp-model', outputs: [{ canaryId: 'c1', output: 'abc' }, { canaryId: 'c2', output: 'abd' }] } });
    expect(res.status).toBe(201);
    expect(res.body.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('Removed simulated endpoints 404', () => {
  it('threats, autoscaling, fhe-inference, agent-swarm, replication, streaming/session', async () => {
    for (const p of ['/api/threats', '/api/autoscaling', '/api/fhe-inference', '/api/agent-swarm', '/api/replication', '/api/streaming/session']) {
      const res = await api('POST', p, { body: {} });
      expect(res.status, p).toBe(404);
    }
  });
});

describe('Security headers', () => {
  it('sets CORS + security headers on every response', async () => {
    const { status, headers } = await api('GET', '/api/health');
    expect(status).toBe(200);
    expect(headers['Access-Control-Allow-Origin']).toBeTruthy();
    expect(headers['Access-Control-Allow-Origin']).not.toBe('*');
    expect(headers['X-XSS-Protection']).toBe('1; mode=block');
  });
});
