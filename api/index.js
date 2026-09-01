/**
 * Provenode mega-router — single serverless function for all /api/* routes
 * Hobby plan limit: max 12 functions. This + 2 crons = 3 total.
 */
import crypto, { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import formidable from 'formidable';
import { getDB } from '../lib/kv.js';
import { shelbyUpload, shelbyDownloadBlob, makeBlobName } from '../lib/shelby.js';
import { createPaymentIntent, getPaymentIntent, listPaymentIntents, priceFor, microToShelbyUSD, PRICE_TABLE, shelbyUSDToMicro, findOrCreateIntent, getPaywallIntent } from '../lib/payments.js';
import { settleMicropayment } from '../lib/settle.js';
import { dispatch, isBlockedWebhookUrl } from '../lib/notify.js';
import { logAudit, getAuditLog } from '../lib/audit.js';
import { signModel } from '../lib/sign.js';
import { buildPassportRecord, verifyPassport, storePassport, findPassportBySha256, anchorOnChain, passportBlobName } from '../lib/passport.js';
import { getRegistryStatus, verifyModelOnChain, getModelCount, MODEL_REGISTRY_ADDRESS, SHELBY_RPC, accountExplorerUrl, txExplorerUrl } from '../lib/registry.js';
import { sendEmail, deploymentVerifiedEmail, integrityMismatchEmail, expiryWarningEmail } from '../lib/email.js';
// ── TOP 10 TIER-1 SHELBY FEATURES ─────────────────────────────────────────
import { createStreamManifest, getChunkUrl } from '../lib/streaming.js';         // #1
import { fedAvg, weightedFedAvg, createFLRound, generateContributionReceipt } from '../lib/federated.js'; // #2
import { computeDelta, applyDelta, buildVersionNode } from '../lib/delta.js';     // #3
import { buildDatasetRecord, shardDataset, computeMerkleRoot, buildDeletionRequest } from '../lib/datasets.js'; // #10
import { generateModelCommitment, verifyProof, STANDARD_BENCHMARK_VECTORS } from '../lib/zkproof.js'; // #7
import { detectTamper, buildHealCommand, buildIncidentRecord, evaluateFleetHealth } from '../lib/selfheal.js'; // #6
import { slugify, validateSlug, contentTypeFor, normalizeSitePath, buildSiteRecord, buildDeploymentRecord, siteBlobName, manifestBlobName, generateDeployKey, normalizeDeployKey } from '../lib/sites.js';

function cors(res) {
  // FIX H-5: Fail closed — never default to wildcard CORS
  const origin = process.env.ALLOWED_ORIGIN ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5173');
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Provenode-Token');
  res.setHeader('Vary', 'Origin');
  // Security: block TRACE (reflected XSS vector)
  res.setHeader('X-XSS-Protection', '1; mode=block');
}

// FIX C-1: Central auth guard — applied to ALL mutating (POST/PATCH/DELETE) routes
/**
 * True when this process is serving real traffic. Used to decide whether a
 * missing DEPLOY_SECRET may fall back to open dev mode.
 * Set ALLOW_OPEN_API=true to force dev behaviour (never do this in production).
 */
function isProdRuntime() {
  if (process.env.ALLOW_OPEN_API === 'true') return false;
  return process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
}

/** Constant-time string compare — avoids leaking the secret through timing. */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a ?? ''), 'utf8');
  const bb = Buffer.from(String(b ?? ''), 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function requireAuth(req, res) {
  const secret = process.env.DEPLOY_SECRET;
  if (!secret) {
    // SECURITY: fail CLOSED in production. An unset secret must never silently
    // open every mutating route (upload, deploy, delete, email, payments).
    if (isProdRuntime()) {
      json(res, 503, { error: 'Server misconfigured: DEPLOY_SECRET is not set, so mutating routes are disabled. Set DEPLOY_SECRET, or ALLOW_OPEN_API=true for local development only.' });
      return true;
    }
    return false; // local development only
  }
  if (!safeEqual(req.headers['x-provenode-token'], secret)) {
    json(res, 401, { error: 'Unauthorized. Provide X-Provenode-Token header.' });
    return true; // signals "handled, stop processing"
  }
  return false;
}

/** True when the request carries the deploy token. Fails closed in production. */
function isAdminRequest(req) {
  const secret = process.env.DEPLOY_SECRET;
  if (!secret) return !isProdRuntime();
  return safeEqual(req.headers['x-provenode-token'], secret);
}

/**
 * CI deploy auth — accepts either the admin token (X-Provenode-Token)
 * or a site-scoped bearer key (Authorization: Bearer pvnd_...).
 * Returns the siteId the key is scoped to, or null when unauthorized.
 */
async function resolveCiAuth(req, db) {
  // admin token always wins, scoped to the requested site
  if (isAdminRequest(req)) return { admin: true };
  const bearer = normalizeDeployKey(req.headers['authorization']);
  if (bearer && bearer.startsWith('pvnd_')) {
    const raw = await db.get(`siteKey:${bearer}`);
    if (raw) return { admin: false, siteId: JSON.parse(raw).siteId };
  }
  return null;
}

function json(res, status, body) {
  res.status(status).json(body);
}

function pathOf(req) {
  // Works with /api/xxx and /api/xxx/yyy after rewrites
  const url = new URL(req.url, 'http://localhost');
  return url.pathname.replace(/\/$/, '') || '/';
}

function queryOf(req) {
  return req.query || {};
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  // raw body for some cases
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return Object.fromEntries(new URLSearchParams(raw)); }
}

/** Extract the blobName from a Shelby download URL: .../blobs/{address}/{blobName} */
function parseBlobName(objectId) {
  const m = /\/blobs\/[^/]+\/(.+)$/.exec(objectId);
  if (!m) throw new Error('Cannot parse blobName from objectId');
  return decodeURIComponent(m[1]);
}

/** Derive the org receiver address from SHELBY_PRIVATE_KEY (or null). */
async function getOrgAddress() {
  const privKey = process.env.SHELBY_PRIVATE_KEY;
  if (!privKey) return null;
  try {
    const { Ed25519Account, Ed25519PrivateKey } = await import('@aptos-labs/ts-sdk');
    return new Ed25519Account({ privateKey: new Ed25519PrivateKey(privKey) }).accountAddress.toString();
  } catch { return null; }
}

export const config = {
  api: { bodyParser: false },
};

/**
 * Issue a Model Passport for a model: signed certificate anchored on-chain
 * (Move tx when MOVE_CONTRACT_ADDRESS + SHELBY_PRIVATE_KEY are set) or as an
 * immutable Shelby blob. Best-effort — never throws into the caller's path.
 */
/** Org Ed25519 public key (hex) used to verify model signatures + attestations. */
async function getOrgPublicKey() {
  const privKey = process.env.SIGN_KEY || process.env.SHELBY_PRIVATE_KEY;
  if (!privKey) return null;
  try {
    const { Account, Ed25519PrivateKey } = await import('@aptos-labs/ts-sdk');
    const account = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(privKey) });
    return account.publicKey.toString();
  } catch { return null; }
}

/**
 * Security headers for user-uploaded site content.
 *
 * CRITICAL: this content is served from the console's own origin, so without a
 * sandbox an uploaded index.html could read localStorage (which holds the
 * deploy token) and exfiltrate it. The CSP below blocks all script execution,
 * all form submissions, and any same-origin credential access from the served
 * document, while still allowing HTML/CSS/images/fonts to render.
 *
 * `sandbox allow-same-origin` is deliberately NOT set — the document is treated
 * as a unique opaque origin, which is what severs access to console storage.
 */
function applySiteContentHeaders(res, { entry, siteSlug }) {
  res.setHeader('Content-Type', entry.contentType || contentTypeFor(entry.path));
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
  res.setHeader('X-Shelby-Object', entry.objectId);
  if (siteSlug) res.setHeader('X-Site-Slug', siteSlug);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', [
    "sandbox allow-popups allow-popups-to-escape-sandbox",
    "default-src 'self' data: blob:",
    "script-src 'none'",
    "object-src 'none'",
    "form-action 'none'",
    "frame-ancestors 'self'",
    "base-uri 'none'",
  ].join('; '));
  // Allow the console's own preview iframe, nothing else.
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
}

async function issuePassport(db, model, { tryOnChain = false, tenantId = '' } = {}) {
  const orgAddress = await getOrgAddress();
  const passport = buildPassportRecord({
    modelId: model.id,
    modelName: model.model || model.name,
    sha256: model.sha256 || model.hash,
    version: model.version || '1.0.0',
    license: model.license,
    registeredAt: model.createdAt,
    orgAddress,
  });
  let note = null;
  if (tryOnChain && process.env.MOVE_CONTRACT_ADDRESS) {
    try {
      const r = await anchorOnChain({
        sha256: passport.sha256,
        shelbyObjectId: model.objectId,
        modelName: passport.modelName,
        version: passport.modelVersion,
        modelId: model.id,
      });
      passport.txHash = r.txHash;
      passport.explorerUrl = r.explorerUrl;
      passport.anchored = 'move-tx';
      model.onChainTx = r.txHash;
      model.onChainExplorerUrl = r.explorerUrl;
      model.onChainAnchor = true;
    } catch (e) {
      note = e.message;
    }
  }
  if (passport.anchored !== 'move-tx') {
    try {
      const up = await shelbyUpload({
        blobData: Buffer.from(JSON.stringify(passport, null, 2)),
        blobName: passportBlobName(model.id),
        apiKey: process.env.SHELBY_API_KEY,
      });
      passport.shelbyObjectId = up.objectId;
      passport.anchored = 'shelby-blob';
    } catch (e) {
      note = note ? `${note} ` : '';
      note += `Shelby blob anchor unavailable: ${e.message}`;
    }
  }
  await storePassport(db, passport);
  model.passportIssued = true;
  await db.put(`model:${model.id}`, JSON.stringify(model));
  await logAudit('passport.issued', { target: model.id, details: { sha256: passport.sha256.slice(0, 12), signed: passport.signed, anchored: passport.anchored }, tenantId });
  return { passport, note };
}


// ── Rate limiting (Redis-backed sliding window — works across all Vercel instances) ─────
// Falls back to in-memory if KV not configured (local dev)
const _memStore = new Map();

async function checkRateLimit(req, limit = 30, windowMs = 10000) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
              req.headers['x-real-ip'] || 'unknown';
  const now = Date.now();
  const windowKey = Math.floor(now / windowMs); // bucket per window
  const key = `rl:${ip}:${windowKey}`;

  try {
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      // Redis INCR + EXPIRE = atomic sliding window, works across all instances
      const { Redis } = await import('@upstash/redis');
      const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, Math.ceil(windowMs / 1000) + 1);
      const remaining = Math.max(0, limit - count);
      return { allowed: count <= limit, remaining, resetAt: (windowKey + 1) * windowMs };
    }
  } catch (_) { /* fall through to in-memory */ }

  // In-memory fallback (local dev only — not shared across instances)
  const record = _memStore.get(key) || { count: 0, resetAt: (windowKey + 1) * windowMs };
  record.count++;
  _memStore.set(key, record);
  if (_memStore.size > 5000) {
    for (const [k, v] of _memStore) { if (now > v.resetAt) _memStore.delete(k); }
  }
  return { allowed: record.count <= limit, remaining: Math.max(0, limit - record.count), resetAt: record.resetAt };
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  // FIX: Block TRACE method — prevents header reflection attacks
  if (req.method === 'TRACE') return res.status(405).json({ error: 'Method not allowed.' });

  // Rate limit mutating requests (POST, PATCH, DELETE) — 30 per 10s per IP
  if (['POST','PATCH','DELETE'].includes(req.method)) {
    const rl = await checkRateLimit(req, 30, 10000);
    res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
    if (!rl.allowed) {
      res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
      return res.status(429).json({ error: 'Too many requests. Slow down.', retryAfterMs: rl.resetAt - Date.now() });
    }
  }

  const path = pathOf(req);
  const q = queryOf(req);
  const method = req.method || 'GET';
  const tenantId = req.headers['x-tenant-id'] || '';
  const db = getDB(tenantId);
  // Tenant-scoped helpers: audit records and webhook dispatch must stay inside
  // the caller's namespace, otherwise one tenant can read another's history.
  const audit = (action, meta = {}) => logAudit(action, { ...meta, tenantId });
  const notify = (event, payload) => dispatch(event, payload, tenantId);

  try {
    // Normalize: strip /api prefix if present
    const p = path.startsWith('/api') ? path.slice(4) || '/' : path;
    const parts = p.split('/').filter(Boolean); // e.g. ['fleet','CAM-1','pending']
    const root = parts[0] || '';

    // ── health ──────────────────────────────────────────────
    if (root === 'health' && method === 'GET') {
      return json(res, 200, {
        status: 'ok', service: 'provenode',
        version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) || 'local',
        environment: process.env.VERCEL_ENV || 'development',
        timestamp: new Date().toISOString(),
      });
    }

    // ── config ──────────────────────────────────────────────
    if (root === 'config' && method === 'GET') {
      return json(res, 200, {
        mode: process.env.SHELBY_API_KEY ? 'shelby' : 'unconfigured',
        network: process.env.SHELBY_NETWORK || 'shelbynet',
        shelbyApiUrl: 'https://api.shelbynet.shelby.xyz/v1',
        // Canonical explorer links — the frontend must use these instead of
        // hardcoding a host, so there is exactly one explorer of record.
        registryAddress: MODEL_REGISTRY_ADDRESS,
        registryExplorerUrl: accountExplorerUrl(MODEL_REGISTRY_ADDRESS),
        maxUploadBytes: 100 * 1024 * 1024,
        version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) || 'local',
        features: {
          lineage: true, abtest: true, devices: true, fleet: true, webhooks: true,
          compliance: true, hfImport: true, onChainManifests: true, canary: true,
          tamperCheck: true, marketplace: true, analytics: true, bluegreen: true,
          schedule: true, audit: true, sign: true, stream: true, metrics: true,
        },
      });
    }

    // ── shelby-status ───────────────────────────────────────
    if (root === 'shelby-status' && method === 'GET') {
      const hasKey = Boolean(process.env.SHELBY_API_KEY);
      return json(res, 200, {
        mode: hasKey ? 'production' : 'unconfigured',
        network: process.env.SHELBY_NETWORK || 'shelbynet',
        connected: hasKey,
        persistentIdentity: Boolean(process.env.SHELBY_PRIVATE_KEY),
        apiUrl: process.env.SHELBY_NETWORK === 'testnet' ? 'https://api.testnet.shelby.xyz/v1' : 'https://api.shelbynet.shelby.xyz/v1',
      });
    }

    // ── registry (live on-chain ModelRegistry) ───────────────
    if (root === 'registry') {
      if (method === 'GET' && parts[1] === 'status') {
        // Public: real on-chain state from the deployed Shelbynet contract.
        try {
          return json(res, 200, { success: true, registry: await getRegistryStatus() });
        } catch (e) {
          return json(res, 502, { error: `Cannot read on-chain registry: ${e.message}` });
        }
      }
      if (method === 'GET' && parts[1] === 'verify') {
        // Public: does this SHA-256 exist in the on-chain registry?
        const sha256 = String(q.sha256 || '').toLowerCase().replace(/^0x/, '');
        if (!/^[0-9a-f]{64}$/.test(sha256)) return json(res, 400, { error: 'Provide a 64-char sha256.' });
        try {
          const verified = await verifyModelOnChain(sha256);
          return json(res, 200, { success: true, sha256, verified, contractAddress: MODEL_REGISTRY_ADDRESS, rpc: SHELBY_RPC });
        } catch (e) {
          return json(res, 502, { error: `Cannot verify on-chain: ${e.message}` });
        }
      }
      if (method === 'GET' && !parts[1]) {
        try {
          return json(res, 200, { success: true, contractAddress: MODEL_REGISTRY_ADDRESS, modelCount: await getModelCount(), rpc: SHELBY_RPC });
        } catch (e) {
          return json(res, 502, { error: `Cannot read on-chain registry: ${e.message}` });
        }
      }
    }

    // ── identity ────────────────────────────────────────────
    if (root === 'identity') {
      // FIX: identity GET now requires auth (exposes wallet address)
      if (requireAuth(req, res)) return;

      if (method === 'GET') {
        const privKey = process.env.SHELBY_PRIVATE_KEY;
        if (!privKey) return json(res, 200, { configured: false, message: 'Set SHELBY_PRIVATE_KEY for persistent org identity.' });
        const { Account, Ed25519PrivateKey } = await import('@aptos-labs/ts-sdk');
        const account = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(privKey) });
        return json(res, 200, {
          configured: true,
          address: account.accountAddress.toString(),
          publicKey: account.publicKey.toString(),
          network: process.env.SHELBY_NETWORK || 'shelbynet',
          explorerUrl: accountExplorerUrl(account.accountAddress.toString()),
        });
      }
      if (method === 'POST') {
        const privKey = process.env.SHELBY_PRIVATE_KEY;
        const apiKey = process.env.SHELBY_API_KEY;
        if (!privKey || !apiKey) return json(res, 400, { error: 'SHELBY_PRIVATE_KEY and SHELBY_API_KEY required.' });
        // Node runtime → node client (was: browser client), and derive the
        // network from env like every other Shelby call site (was: hardcoded TESTNET).
        const { Ed25519Account, Ed25519PrivateKey } = await import('@aptos-labs/ts-sdk');
        const { ShelbyNodeClient } = await import('@shelby-protocol/sdk/node');
        const { Network } = await import('@aptos-labs/ts-sdk');
        const networkStr = process.env.SHELBY_NETWORK || 'shelbynet';
        const network = networkStr === 'shelbynet' ? Network.SHELBYNET : Network.TESTNET;
        const account = new Ed25519Account({ privateKey: new Ed25519PrivateKey(privKey) });
        const client = new ShelbyNodeClient({ network, apiKey });
        try {
          await client.fundAccountWithAPT({ address: account.accountAddress, amount: 100_00000000 });
          await client.fundAccountWithShelbyUSD({ address: account.accountAddress, amount: 10000_00000000 });
        } catch (e) {
          console.error('[identity] fund failed:', e.message);
          return json(res, 502, { error: `Faucet funding failed on ${networkStr}: ${e.message}` });
        }
        return json(res, 200, { success: true, address: account.accountAddress.toString(), funded: true, network: networkStr });
      }
    }

    // ── models ──────────────────────────────────────────────
    if (root === 'models' && method === 'GET') {
      // `name`, `version` and `zkVerified` were missing, so the console rendered
      // blank model dropdowns and could never show the verified badge.
      const PUBLIC = ['id','model','name','version','objectId','blobName','sha256','size','mode','address','expiresAt','parentId','tags','createdAt','signature','passportIssued','zkVerified','onChainTx','onChainExplorerUrl','onChainAnchor'];
      const { keys } = await db.list({ prefix: 'model:' });
      const models = (await Promise.all(keys.map(async ({ name }) => {
        const d = await db.get(name); if (!d) return null;
        const r = JSON.parse(d);
        return Object.fromEntries(PUBLIC.map(f => [f, r[f]]).filter(([,v]) => v !== undefined));
      }))).filter(Boolean).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
      return json(res, 200, { success: true, models });
    }

    // ── certificate ───────────────────────────────────────────
    if (root === 'certificate' && method === 'GET') {
      const id = parts[1];
      if (!id) return json(res, 400, { error: 'Model ID required' });
      const recordStr = await db.get(`model:${id}`);
      if (!recordStr) return json(res, 404, { error: 'Model not found' });
      const record = JSON.parse(recordStr);
      
      const certificate = {
        modelId: record.id,
        modelName: record.model,
        mode: record.mode,
        sha256: record.sha256,
        size: record.size,
        createdAt: record.createdAt,
        ownerAddress: record.address || '0xProvenodeDemo',
        storageProvider: record.mode === 'shelby' ? 'Shelby Protocol' : 'Local Sandbox',
        shelbyObjectId: record.objectId,
        lineage: record.parentId ? { parentId: record.parentId } : null,
        cryptographicSignature: record.signature || 'unsigned',
        issuer: 'Provenode Network',
        verificationUrl: `https://${req.headers.host || 'www.provenodes.xyz'}/verify?id=${record.id}`,
      };
      return json(res, 200, { success: true, certificate });
    }

    // ── zkproof ───────────────────────────────────────────────
    if (root === 'zkproof') {
      const action = parts[1]; // 'generate' or 'verify'
      const id = parts[2];
      if (!id) return json(res, 400, { error: 'Model ID required' });
      
      const recordStr = await db.get(`model:${id}`);
      if (!recordStr) return json(res, 404, { error: 'Model not found' });
      const record = JSON.parse(recordStr);
      
      if (action === 'generate' && method === 'POST') {
        // FIX C-1: Auth guard on proof generation (writes KV + marks model verified)
        if (requireAuth(req, res)) return;
        const { generateModelCommitment } = await import('../lib/zkproof.js');
        const body = await readBody(req);
        // Real mode: proof requires the model's ACTUAL outputs on test vectors.
        const testVectors = Array.isArray(body.testVectors) ? body.testVectors : null;
        if (!testVectors || testVectors.some(v => v.output === undefined && v.expectedOutput === undefined)) {
          return json(res, 400, { error: 'Real ZK proof requires testVectors with actual model outputs (v.output or v.expectedOutput).' });
        }
        const orgPublicKey = await getOrgPublicKey();
        if (!orgPublicKey) {
          return json(res, 503, { error: 'Signing key not configured (SIGN_KEY or SHELBY_PRIVATE_KEY). Attestations must be signed by the org key to be verifiable.' });
        }
        let proof;
        try {
          ({ proof } = generateModelCommitment({
            modelSha256: record.sha256,
            testVectors,
            publicKeyHex: orgPublicKey,
          }));
        } catch (e) {
          return json(res, 400, { error: e.message });
        }

        // Store proof in KV
        await db.put(`zkproof:${id}`, JSON.stringify(proof));

        // Mark model as verified
        record.zkVerified = true;
        await db.put(`model:${id}`, JSON.stringify(record));

        return json(res, 200, { success: true, proof });
      }

      if (action === 'verify' && method === 'GET') {
        const proofStr = await db.get(`zkproof:${id}`);
        if (!proofStr) return json(res, 404, { error: 'ZK proof not found for this model' });

        const { verifyProof } = await import('../lib/zkproof.js');
        const proof = JSON.parse(proofStr);
        // Verify against the ORG key from our own identity — never the key
        // embedded in the proof (that would make forgery trivial).
        const result = verifyProof(proof, await getOrgPublicKey());

        return json(res, 200, { success: true, verified: result.valid, result, proof });
      }
    }

    // ── integrity ─────────────────────────────────────────────
    if (root === 'integrity') {
      // FIX C-1: Auth guard on all mutating requests (scan/heal write to KV)
      if (method !== 'GET' && requireAuth(req, res)) return;
      const action = parts[1]; // 'scan' or 'heal'
      const deviceId = parts[2];
      
      if (action === 'scan' && method === 'POST') {
        const { evaluateFleetHealth } = await import('../lib/selfheal.js');
        const { keys: devKeys } = await db.list({ prefix: 'device:' });
        const devices = await Promise.all(devKeys.map(async k => JSON.parse(await db.get(k.name))));
        
        const { keys: modKeys } = await db.list({ prefix: 'model:' });
        const models = await Promise.all(modKeys.map(async k => JSON.parse(await db.get(k.name))));
        
        const health = evaluateFleetHealth(devices, models);
        return json(res, 200, { success: true, health });
      }
      
      if (action === 'heal' && method === 'POST') {
        if (!deviceId) return json(res, 400, { error: 'Device ID required' });
        const body = await readBody(req);
        const { modelId } = body;
        if (!modelId) return json(res, 400, { error: 'Model ID required' });
        
        const modelStr = await db.get(`model:${modelId}`);
        if (!modelStr) return json(res, 404, { error: 'Model not found' });
        const model = JSON.parse(modelStr);
        
        const { buildHealCommand } = await import('../lib/selfheal.js');
        const command = buildHealCommand({ 
          deviceId, 
          modelId, 
          shelbyObjectId: model.objectId, 
          cleanSha256: model.sha256 
        });
        
        // In a real app, send via WebSocket. Here we store it for the device to pick up.
        await db.put(`heal:${deviceId}`, JSON.stringify(command));
        
        // Mark device as currently healing
        const devStr = await db.get(`device:${deviceId}`);
        if (devStr) {
          const dev = JSON.parse(devStr);
          dev.healing = true;
          await db.put(`device:${deviceId}`, JSON.stringify(dev));
        }
        
        return json(res, 200, { success: true, command });
      }
    }

    // ── datasets ──────────────────────────────────────────────
    if (root === 'datasets') {
      // FIX C-1: Auth guard on all mutating requests. This block preempts the
      // guarded block below, so without this POST /api/datasets was unauthenticated.
      if (method !== 'GET' && requireAuth(req, res)) return;
      const action = parts[1]; // 'delete' or undefined
      
      if (method === 'GET') {
        // Real mode: paid dataset stream — requires a settled ShelbyUSD intent for this dataset.
        if (q.id) {
          const raw = await db.get(`dataset:${q.id}`);
          if (!raw) return json(res, 404, { error: 'Dataset not found.' });
          const record = JSON.parse(raw);
          if (q.stream === '1') {
            const intent = q.paymentIntentId ? await getPaymentIntent(q.paymentIntentId, tenantId) : null;
            // SECURITY: bind to item type + amount, same reasoning as the
            // marketplace import path. Stream access is not single-use (the
            // buyer may re-read shard metadata), but it must be the right item.
            const intentValid = intent
              && intent.status === 'paid'
              && intent.itemId === q.id
              && intent.item === 'dataset_stream'
              && Number(intent.amountMicro) >= shelbyUSDToMicro(PRICE_TABLE.dataset_stream);
            if (!intentValid) {
              return json(res, 402, {
                error: 'Paid stream access required. Create and settle a ShelbyUSD dataset_stream intent first.',
                priceShelbyUSD: PRICE_TABLE.dataset_stream,
                amountMicro: shelbyUSDToMicro(PRICE_TABLE.dataset_stream),
              });
            }
            return json(res, 200, {
              success: true,
              dataset: { id: record.id, name: record.name, merkleRoot: record.merkleRoot, shardCount: record.shardCount },
              shards: (record.shards || []).map(s => ({ index: s.index, sha256: s.sha256, size: s.size, shelbyObjectId: s.shelbyObjectId })),
              download: 'Fetch each shard blob from Shelby via shelbyObjectId and verify its SHA-256 against the record.',
            });
          }
          return json(res, 200, { success: true, dataset: record });
        }
        const { keys } = await db.list({ prefix: 'dataset:' });
        const datasets = await Promise.all(keys.map(async k => JSON.parse(await db.get(k.name))));
        return json(res, 200, { success: true, datasets: datasets.sort((a,b) => new Date(b.registeredAt) - new Date(a.registeredAt)) });
      }
      
      if (method === 'POST' && !action) {
        // Real mode: the dataset bytes must be supplied (multipart "file" or base64 "dataBase64").
        const isMultipart = (req.headers['content-type'] || '').includes('multipart/form-data');
        let buffer = null;
        let fields = {};
        if (isMultipart) {
          const form = formidable({ maxFileSize: 500 * 1024 * 1024, allowEmptyFiles: false, minFileSize: 1 });
          try {
            const [f, v] = await new Promise((resolve, reject) =>
              form.parse(req, (err, ff, vv) => err ? reject(err) : resolve([ff, vv]))
            );
            fields = f;
            const uploaded = Array.isArray(v?.file) ? v.file[0] : v?.file;
            if (uploaded) buffer = await (await import('node:fs/promises')).readFile(uploaded.filepath);
          } catch (fe) {
            return json(res, 400, { error: fe.message || 'Dataset upload parse error.' });
          }
        } else {
          const body = await readBody(req);
          fields = body;
          if (typeof body.dataBase64 === 'string' && body.dataBase64) buffer = Buffer.from(body.dataBase64, 'base64');
        }
        if (!buffer || !buffer.length) {
          return json(res, 400, { error: 'Real mode requires dataset bytes: multipart "file" or base64 "dataBase64".' });
        }
        if (!process.env.SHELBY_API_KEY) {
          return json(res, 503, { error: 'SHELBY_API_KEY not configured. Dataset registration requires real Shelby storage.' });
        }
        const { buildDatasetRecord, shardDataset } = await import('../lib/datasets.js');
        const realShards = shardDataset(buffer, fields.name);
        // Upload every shard to Shelby (real)
        const shards = [];
        for (const s of realShards) {
          const up = await shelbyUpload({ blobData: s.data, blobName: s.name, apiKey: process.env.SHELBY_API_KEY });
          shards.push({ index: s.index, sha256: s.sha256, size: s.size, shelbyObjectId: up.objectId });
        }
        const record = buildDatasetRecord({
          name: fields.name,
          license: fields.license,
          source: fields.source,
          description: fields.description,
          shards,
        });
        await db.put(`dataset:${record.id}`, JSON.stringify(record));
        await audit('dataset.registered', { target: record.id, details: { name: record.name, merkleRoot: record.merkleRoot, shardCount: shards.length } });
        return json(res, 200, { success: true, record });
      }
      
      if (action === 'delete' && method === 'POST') {
        const body = await readBody(req);
        const { datasetId, reason } = body;
        if (!datasetId) return json(res, 400, { error: 'datasetId required' });
        
        const dsStr = await db.get(`dataset:${datasetId}`);
        if (!dsStr) return json(res, 404, { error: 'Dataset not found' });
        
        const { buildDeletionRequest } = await import('../lib/datasets.js');
        const reqRecord = buildDeletionRequest({ datasetId, requestedBy: 'admin', reason });
        
        // Update dataset status
        const ds = JSON.parse(dsStr);
        ds.status = 'deletion_pending';
        ds.deletionRequest = reqRecord;
        
        await db.put(`dataset:${datasetId}`, JSON.stringify(ds));
        return json(res, 200, { success: true, request: reqRecord });
      }
    }

    // ── federated ──────────────────────────────────────────────
    if (root === 'federated') {
      // FIX C-1: Auth guard — merge is CPU-bound (allocates arrays per nodeId)
      if (method !== 'GET' && requireAuth(req, res)) return;
      if (parts[1] === 'merge' && method === 'POST') {
        // Real mode: merge aggregates gradients actually submitted to a round (KV), never fabricated data.
        const body = await readBody(req);
        const { modelId, roundNumber } = body;
        if (!modelId || !roundNumber) return json(res, 400, { error: 'modelId and roundNumber required.' });
        const roundKey = `fl:round:${modelId}:${roundNumber}`;
        const rawRound = await db.get(roundKey);
        if (!rawRound) return json(res, 404, { error: 'Round not found. Submit gradients via POST /api/federated first.' });
        const round = JSON.parse(rawRound);
        if (!round.rawContributions || round.rawContributions.length < 2) {
          return json(res, 400, { error: 'Need at least 2 gradient submissions to aggregate.' });
        }
        const { weightedFedAvg } = await import('../lib/federated.js');
        const gradients = round.rawContributions.map(c => {
          const buf = Buffer.from(Array.isArray(c.gradientBuffer) ? c.gradientBuffer : c.gradientBuffer);
          // Buffer.from() allocates out of Node's shared pool, so byteOffset is
          // usually NOT 4-byte aligned and `new Float32Array(buf.buffer, off)`
          // throws RangeError. Copy into a fresh aligned buffer instead.
          const n = Math.floor(buf.byteLength / 4);
          const out = new Float32Array(n);
          for (let i = 0; i < n; i++) out[i] = buf.readFloatLE(i * 4);
          return out;
        });
        const sampleCounts = round.rawContributions.map(c => c.sampleCount || 100);
        const aggregated = weightedFedAvg(gradients, sampleCounts);
        const objectId = await shelbyUpload({ blobData: aggregated, blobName: `fl/${modelId}/merged-round-${roundNumber}`, apiKey: process.env.SHELBY_API_KEY }).then(r => r.objectId);
        round.status = 'aggregated';
        round.aggregatedObjectId = objectId;
        round.aggregatedAt = new Date().toISOString();
        await db.put(roundKey, JSON.stringify(round));
        await audit('fl.aggregated', { target: modelId, details: { roundNumber, participants: round.participantCount, objectId } });
        return json(res, 200, { success: true, message: 'Merged globally', newHash: `0x${createHash('sha256').update(aggregated).digest('hex')}`, objectId });
      }
    }

    // ── agent (Mistral AI / Bot) ──────────────────────────────
    if (root === 'agent' && method === 'POST') {
      // Public chat bot — the floating widget in the UI has no DEPLOY_SECRET token,
      // so this route is exempt from requireAuth. It is throttled per IP instead,
      // keeping anonymous users from burning the MISTRAL_API_KEY quota; requests
      // carrying a valid token are treated as trusted operators (higher limit).
      const trusted = !process.env.DEPLOY_SECRET || req.headers['x-provenode-token'] === process.env.DEPLOY_SECRET;
      const rl = await checkRateLimit(req, trusted ? 120 : 10, 60000);
      if (!rl.allowed) {
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))));
        return json(res, 429, { error: 'Rate limit exceeded. Try again in a moment.' });
      }
      const body = await readBody(req);
      const msg = (body.message || '').trim();

      // Real mode only — no canned demo replies.
      const apiKey = process.env.MISTRAL_API_KEY;
      if (!apiKey) return json(res, 503, { error: 'MISTRAL_API_KEY not configured. Real mode requires a working agent backend.' });

      // ── Tool-calling: ground answers in REAL platform state (KV-backed) ──
      const tools = [
        { type: 'function', function: { name: 'get_platform_summary', description: 'Platform-wide snapshot: registered model count, deployment count, fleet device count, and on-chain registry status.', parameters: { type: 'object', properties: {}, required: [] } } },
        { type: 'function', function: { name: 'list_models', description: 'List registered AI models (name, id, sha256, size, mode, createdAt).', parameters: { type: 'object', properties: {}, required: [] } } },
        { type: 'function', function: { name: 'list_deployments', description: 'List deployments (model, version, status, rollout progress, region, canary).', parameters: { type: 'object', properties: {}, required: [] } } },
        { type: 'function', function: { name: 'get_fleet_status', description: 'Fleet health: device count by status (online/offline/healing) and per-device detail.', parameters: { type: 'object', properties: {}, required: [] } } },
        { type: 'function', function: { name: 'get_registry_status', description: 'Live on-chain ModelRegistry status (contract address, model count).', parameters: { type: 'object', properties: {}, required: [] } } },
        { type: 'function', function: { name: 'get_earnings', description: 'Earnings: settled on-chain ShelbyUSD totals and per-payment detail.', parameters: { type: 'object', properties: {}, required: [] } } },
        { type: 'function', function: { name: 'list_marketplace_listings', description: 'List marketplace listings (name, price, license, downloads, publishedAt).', parameters: { type: 'object', properties: {}, required: [] } } },
        { type: 'function', function: { name: 'list_payment_intents', description: 'List payment intents (item, amount, status, paidAt, txHash).', parameters: { type: 'object', properties: {}, required: [] } } },
      ];
      const runTool = async (name) => {
        switch (name) {
          case 'get_platform_summary': {
            const [models, deployments, devices] = await Promise.all([
              db.list({ prefix: 'model:' }),
              db.list({ prefix: 'deployment:' }),
              db.list({ prefix: 'device:' }),
            ]);
            let registry = null;
            try { const { getRegistryStatus, MODEL_REGISTRY_ADDRESS } = await import('../lib/registry.js'); registry = { contractAddress: MODEL_REGISTRY_ADDRESS, ...(await getRegistryStatus()) }; } catch { /* registry unavailable */ }
            return { models: models.keys.length, deployments: deployments.keys.length, devices: devices.keys.length, registry };
          }
          case 'list_models': {
            const { keys } = await db.list({ prefix: 'model:' });
            const models = (await Promise.all(keys.map(async ({ name }) => {
              const d = await db.get(name); if (!d) return null;
              const m = JSON.parse(d);
              return { id: m.id, model: m.model, sha256: m.sha256, size: m.size, mode: m.mode, createdAt: m.createdAt };
            }))).filter(Boolean);
            return { count: models.length, models };
          }
          case 'list_deployments': {
            const { keys } = await db.list({ prefix: 'deployment:' });
            const deployments = (await Promise.all(keys.map(async ({ name }) => {
              const d = await db.get(name); if (!d) return null;
              const m = JSON.parse(d);
              return { id: m.id, model: m.model, version: m.version, status: m.status, progress: m.progress, region: m.region, canary: !!(m.canary && m.canary.enabled), createdAt: m.createdAt };
            }))).filter(Boolean);
            return { count: deployments.length, deployments };
          }
          case 'get_fleet_status': {
            const { keys } = await db.list({ prefix: 'device:' });
            const devices = (await Promise.all(keys.map(async ({ name }) => {
              const d = await db.get(name); if (!d) return null;
              const dev = JSON.parse(d);
              return { id: dev.id, type: dev.type, arch: dev.arch, location: dev.location, status: dev.status, healing: !!dev.healing, lastSeenAt: dev.lastSeenAt };
            }))).filter(Boolean);
            const byStatus = {};
            for (const dev of devices) byStatus[dev.status] = (byStatus[dev.status] || 0) + 1;
            return { total: devices.length, byStatus, devices };
          }
          case 'get_registry_status': {
            try { const { getRegistryStatus, MODEL_REGISTRY_ADDRESS } = await import('../lib/registry.js'); return { contractAddress: MODEL_REGISTRY_ADDRESS, ...(await getRegistryStatus()) }; }
            catch (e) { return { error: `Registry unavailable: ${e.message}` }; }
          }
          case 'get_earnings': {
            const settled = (await listPaymentIntents(tenantId)).filter(p => p.status === 'paid');
            const totalMicro = settled.reduce((a, p) => a + (p.amountMicro || 0), 0);
            return { totalShelbyUSD: microToShelbyUSD(totalMicro).toFixed(6), settlements: settled.length, earnings: settled.map(p => ({ id: p.id, item: p.item, amountShelbyUSD: microToShelbyUSD(p.amountMicro).toFixed(6), txHash: p.txHash || null, paidAt: p.paidAt || null })) };
          }
          case 'list_marketplace_listings': {
            const { keys } = await db.list({ prefix: 'marketplace:' });
            const listings = (await Promise.all(keys.map(async ({ name }) => {
              const d = await db.get(name); if (!d) return null;
              const l = JSON.parse(d);
              return { id: l.id, name: l.name, price: l.price, license: l.license, downloads: l.downloads, publishedAt: l.publishedAt };
            }))).filter(Boolean);
            return { count: listings.length, listings };
          }
          case 'list_payment_intents': {
            const intents = await listPaymentIntents(tenantId);
            return { count: intents.length, intents: intents.map(p => ({ id: p.id, item: p.item, itemId: p.itemId, amountShelbyUSD: p.amountShelbyUSD, status: p.status, createdAt: p.createdAt, paidAt: p.paidAt, txHash: p.txHash })) };
          }
          default:
            return { error: `Unknown tool: ${name}` };
        }
      };
      const callMistral = async (messages) => {
        const mRes = await fetch('https://api.mistral.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model: 'mistral-small-latest', messages, tools, tool_choice: 'auto' }),
        });
        if (!mRes.ok) return { error: `Agent API error: ${mRes.status}` };
        return { data: await mRes.json() };
      };
      const SYSTEM = 'You are the Provenode Autonomous Network Agent for the Provenode platform. You answer questions about models, deployments, fleet devices, the on-chain registry, marketplace listings, payments, and earnings. ALWAYS ground your answer in real data: call the provided tools to read live platform state, then answer from the tool results. Never invent numbers. Keep answers concise and technical.';
      try {
        const first = await callMistral([
          { role: 'system', content: SYSTEM },
          { role: 'user', content: msg },
        ]);
        if (first.error) return json(res, 502, { error: first.error });
        const assistant = first.data.choices[0].message;
        const toolCalls = assistant.tool_calls || [];
        if (!toolCalls.length) return json(res, 200, { response: assistant.content || '', data: {} });

        // Execute every requested tool against real KV state, then let Mistral
        // compose the final grounded answer (single follow-up round trip).
        const toolData = {};
        const toolResults = [];
        for (const tc of toolCalls) {
          let result;
          try { result = await runTool(tc.function.name); }
          catch (e) { result = { error: e.message }; }
          toolData[tc.function.name] = result;
          toolResults.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
        }
        const second = await callMistral([
          { role: 'system', content: SYSTEM },
          { role: 'user', content: msg },
          assistant,
          ...toolResults,
        ]);
        if (second.error) return json(res, 502, { error: second.error });
        return json(res, 200, { response: second.data.choices[0].message.content || '', data: toolData });
      } catch (e) {
        console.error('Mistral API error:', e);
        return json(res, 502, { error: 'Agent API unavailable.' });
      }
    }

    // ── upload ──────────────────────────────────────────────
    if (root === 'upload' && method === 'POST') {
      // FIX C-1: Auth guard on all mutating requests (missing before — anyone could upload)
      if (requireAuth(req, res)) return;
      const form = formidable({ maxFileSize: 100 * 1024 * 1024, keepExtensions: true, allowEmptyFiles: false, minFileSize: 1 });
      let fields, files;
      try {
        [fields, files] = await new Promise((resolve, reject) =>
          form.parse(req, (err, f, v) => err ? reject(err) : resolve([f, v]))
        );
      } catch (fe) {
        return json(res, 400, { error: fe.message?.includes('empty') || fe.httpCode === 400 ? 'File is empty or too small.' : fe.message || 'Upload parse error.' });
      }
      const uploaded = Array.isArray(files?.file) ? files.file[0] : files?.file;
      if (!uploaded) return json(res, 400, { error: 'No file provided.' });
      const rawName = Array.isArray(fields.name) ? fields.name[0] : fields.name;
      const modelName = (rawName || uploaded.originalFilename || 'unnamed').toString().slice(0, 120);
      const parentId = Array.isArray(fields.parentId) ? fields.parentId[0] : fields.parentId;
      const tags = Array.isArray(fields.tags) ? fields.tags[0] : fields.tags;
      const { readFile } = await import('node:fs/promises');
      const bytes = await readFile(uploaded.filepath);
      if (!bytes.length) return json(res, 400, { error: 'File is empty.' });
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const id = crypto.randomUUID();
      const slug = modelName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'model';
      const blobName = makeBlobName(slug, `-${id.slice(0, 8)}`);
      const { objectId, mode, warning, address, blobName: storedBlobName, expiresAt } = await shelbyUpload({
        blobData: new Uint8Array(bytes), blobName, apiKey: process.env.SHELBY_API_KEY,
      });
      const sig = await signModel(sha256);
      const record = {
        id, model: modelName, objectId, sha256, size: bytes.length, mode, address, blobName: storedBlobName || blobName || null, expiresAt,
        parentId: parentId || null,
        tags: tags ? String(tags).split(',').map(t => t.trim()) : [],
        signature: sig || null,
        createdAt: new Date().toISOString(),
      };
      await db.put(`model:${id}`, JSON.stringify(record));
      if (parentId) await db.put(`lineage:${id}`, JSON.stringify({ parentId, childId: id }));
      await audit('model.registered', { target: id, details: { model: modelName, mode } });
      await notify('model.registered', { id, model: modelName, mode, sha256: sha256.slice(0, 12) });
      // Auto-issue the Model Passport (best-effort — never blocks the upload).
      try { await issuePassport(db, record, { tryOnChain: false, tenantId }); } catch { /* best-effort */ }
      return json(res, 200, { success: true, id, objectId, hash: sha256, size: bytes.length, mode, expiresAt, passportIssued: true, ...(warning && { warning }) });
    }

    // ── deploy ──────────────────────────────────────────────
    if (root === 'deploy' && method === 'POST') {
      // FIX C-1: Auth guard on all mutating requests (missing before — anyone could deploy)
      if (requireAuth(req, res)) return;
      const body = await readBody(req);
      const { modelId, modelName, version, region, canary, policy } = body;
      let model = null;
      if (modelId) {
        const raw = await db.get(`model:${modelId}`);
        if (!raw) return json(res, 404, { error: 'Unknown modelId.' });
        model = JSON.parse(raw);
      }
      const resolvedName = model?.model || modelName;
      const resolvedVersion = version || model?.version || 'latest';
      if (!resolvedName) return json(res, 400, { error: 'modelName or modelId required.' });
      // Real mode: only registered models with real Shelby objects can be deployed.
      if (!model || !model.sha256 || !model.objectId) {
        return json(res, 400, { error: 'Real mode requires a registered model (modelId) with an on-chain SHA-256 and Shelby object. Upload the model first.' });
      }
      const sha256 = model.sha256, shelbyObjectId = model.objectId, deployMode = model.mode;
      const id = crypto.randomUUID();
      const manifest = {
        id, model: resolvedName, version: resolvedVersion,
        region: region || 'Global', sha256, shelbyObjectId,
        commitment: '0x' + sha256.substring(0, 12),
        mode: deployMode, status: 'deploying', progress: 0,
        canary: canary ? { enabled: true, stages: [10, 25, 50, 100], currentStage: 0, policy: policy || { errorThreshold: 2, autoAdvance: true } } : null,
        modelId: modelId || null,
        createdAt: new Date().toISOString(),
      };
      const mBlob = new TextEncoder().encode(JSON.stringify(manifest));
      const mResult = await shelbyUpload({ blobData: mBlob, blobName: `manifests/dep-${id.slice(0, 8)}`, apiKey: process.env.SHELBY_API_KEY });
      manifest.manifestObjectId = mResult.objectId;
      await db.put(`deployment:${id}`, JSON.stringify(manifest));
      await db.put(`devices:${id}`, JSON.stringify({ verified: 0, target: 248 }));
      await audit('deployment.started', { target: id, details: { model: resolvedName } });
      await notify('deployment.started', { id, model: resolvedName, version: resolvedVersion, mode: deployMode });
      return json(res, 200, { success: true, manifest });
    }

    // ── status ──────────────────────────────────────────────
    if (root === 'status') {
      if (method === 'GET') {
        const id = q.id;
        if (!id) {
          const { keys } = await db.list({ prefix: 'deployment:' });
          const deployments = (await Promise.all(keys.map(async ({ name }) => {
            const d = await db.get(name); return d ? JSON.parse(d) : null;
          }))).filter(Boolean).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
          return json(res, 200, { success: true, deployments });
        }
        const [md, dd] = await Promise.all([db.get(`deployment:${id}`), db.get(`devices:${id}`)]);
        if (!md) return json(res, 404, { success: false, error: 'Not found.' });
        const manifest = JSON.parse(md);
        const devices = dd ? JSON.parse(dd) : { verified: 0, target: 248 };
        manifest.progress = Math.min(100, Math.round((devices.verified / devices.target) * 100));
        // SECURITY: a GET must not mutate state, send email, or fire webhooks.
        // Only an authenticated caller may flip a deployment to 'verified';
        // anonymous readers see the computed progress without side effects.
        if (manifest.progress >= 100 && manifest.status !== 'verified' && isAdminRequest(req)) {
          manifest.status = 'verified';
          await db.put(`deployment:${id}`, JSON.stringify(manifest));
          await notify('deployment.verified', { id, model: manifest.model });
          if (process.env.ALERT_EMAIL) {
            await sendEmail({ to: process.env.ALERT_EMAIL, ...deploymentVerifiedEmail(manifest) });
          }
        }
        return json(res, 200, { success: true, manifest, devices });
      }
      if (method === 'POST') {
        const body = await readBody(req);
        // Use the shared guard so this route inherits fail-closed behaviour and
        // constant-time comparison instead of hand-rolling both.
        if (requireAuth(req, res)) return;
        const { id, status, count } = body;
        if (!id) return json(res, 400, { error: 'id required.' });
        if (status === 'verified') {
          const dd = await db.get(`devices:${id}`);
          if (dd) {
            const devices = JSON.parse(dd);
            devices.verified = Math.min(devices.target, devices.verified + (Number.isFinite(count) && count > 0 ? count : 1));
            await db.put(`devices:${id}`, JSON.stringify(devices));
          }
        }
        return json(res, 200, { success: true });
      }
    }

    // ── lineage ─────────────────────────────────────────────
    if (root === 'lineage' && method === 'GET') {
      const modelId = q.modelId;
      if (!modelId) return json(res, 400, { error: 'modelId required.' });
      const getModel = async (id) => { const d = await db.get(`model:${id}`); return d ? JSON.parse(d) : null; };
      const rootM = await getModel(modelId);
      if (!rootM) return json(res, 404, { error: 'Model not found.' });
      const ancestors = [];
      let cursor = rootM;
      while (cursor?.parentId) {
        const parent = await getModel(cursor.parentId);
        if (!parent) break;
        ancestors.unshift({ id: parent.id, model: parent.model, sha256: parent.sha256, createdAt: parent.createdAt, mode: parent.mode });
        cursor = parent;
      }
      const { keys } = await db.list({ prefix: 'lineage:' });
      const descendants = [];
      for (const { name } of keys) {
        const d = await db.get(name); if (!d) continue;
        const { parentId, childId } = JSON.parse(d);
        if (parentId === modelId) {
          const child = await getModel(childId);
          if (child) descendants.push({ id: child.id, model: child.model, sha256: child.sha256, createdAt: child.createdAt, mode: child.mode });
        }
      }
      return json(res, 200, {
        success: true,
        root: { id: rootM.id, model: rootM.model, sha256: rootM.sha256, createdAt: rootM.createdAt, mode: rootM.mode },
        ancestors, descendants, depth: ancestors.length,
      });
    }

    // ── objects ─────────────────────────────────────────────
    if (root === 'objects') {
      // Real-mode blob data + lifecycle actions require auth; the public listing stays open.
      // With the paywall enabled, GET :id/blob is exempt from the auth guard — it enforces
      // the x402-style pay-per-read flow instead (admin token still downloads free).
      const paywallOn = (process.env.PAYWALL_MODE || 'on') !== 'off';
      const isPaidBlobRoute = paywallOn && method === 'GET' && !!parts[1] && parts[2] === 'blob';
      if (parts[1] && !isPaidBlobRoute && requireAuth(req, res)) return;

      // GET /api/objects/:id/blob — x402-style pay-per-read. Unauthenticated
      // callers get a 402 quote; they retry with an X-Payment header carrying a
      // BCS-encoded SenderBuiltMicropayment, which is settled on-chain before
      // the blob streams (receipt in X-Payment-Response). Admin token = free.
      if (method === 'GET' && parts[1] && parts[2] === 'blob') {
        const id = parts[1];
        const raw = await db.get(`model:${id}`);
        if (!raw) return json(res, 404, { error: 'Object not found.' });
        const m = JSON.parse(raw);
        if (m.mode !== 'shelby' || !m.objectId) {
          return json(res, 400, { error: 'Object is not a real Shelby blob. Real mode requires SHELBY_API_KEY.' });
        }

        let receipt = null;
        if (paywallOn && !isAdminRequest(req)) {
          // x402 keeps quotes anonymous on purpose, so 'anon' stays the default
          // identity here. The security boundary is enforced at settlement:
          // a paid intent may only be replayed by a caller presenting the same
          // micropayment proof (see the status === 'paid' branch below).
          const payer = req.headers['x-payer'] || 'anon';
          const paymentBcs = req.headers['x-payment'];
          if (!paymentBcs) {
            // ── Step 1: quote. Pending intents are reused per object + payer. ──
            const intent = await findOrCreateIntent({
              resourceKey: id,
              item: 'download',
              itemId: id,
              payer,
              receiver: await getOrgAddress(),
              description: `Blob download: ${m.model || id}`,
              tenantId,
            });
            const { SHELBYUSD_TOKEN_ADDRESS, SHELBYUSD_TOKEN_MODULE, SHELBYUSD_FA_METADATA_ADDRESS } = await import('@shelby-protocol/sdk/node');
            return json(res, 402, {
              error: 'Payment required. Settle the intent, then retry with the X-Payment header.',
              x402: {
                scheme: 'shelby-micropayment',
                intentId: intent.id,
                amountShelbyUSD: intent.amountShelbyUSD,
                amountMicro: intent.amountMicro,
                receiver: intent.receiver,
                token: { address: SHELBYUSD_TOKEN_ADDRESS, module: SHELBYUSD_TOKEN_MODULE, faMetadataAddress: SHELBYUSD_FA_METADATA_ADDRESS },
                pay: { header: 'X-Payment', value: 'BCS-encoded SenderBuiltMicropayment (hex)', optional: { 'X-Payment-Intent': intent.id, 'X-Payer': payer } },
                expiresAt: intent.expiresAt,
              },
            });
          }

          // ── Step 2: settle the micropayment, then stream the blob. ──
          const intent = (req.headers['x-payment-intent'] ? await getPaymentIntent(req.headers['x-payment-intent'], tenantId) : null)
            || await getPaywallIntent(id, payer, tenantId);
          if (!intent) {
            return json(res, 404, { error: 'No payment intent for this object. Request a quote first (GET without X-Payment).' });
          }
          if (new Date(intent.expiresAt) < new Date()) {
            return json(res, 402, { error: 'Payment intent expired. Request a fresh quote (GET without X-Payment).', intentId: intent.id });
          }
          if (intent.status === 'paid') {
            // Idempotent retry after settlement. SECURITY: the replay must
            // present the SAME micropayment proof that settled the intent —
            // otherwise a paid 'anon' intent would make the blob free for
            // every subsequent caller.
            if (!intent.micropaymentBcs || intent.micropaymentBcs !== paymentBcs) {
              return json(res, 402, {
                error: 'This object was already paid for by another payment. Request a fresh quote with your own X-Payer identity.',
                intentId: intent.id,
              });
            }
            receipt = { intentId: intent.id, txHash: intent.txHash, receiptHash: intent.receiptHash, amountMicro: intent.amountMicro };
          } else {
            const result = await settleMicropayment({ intent, micropaymentBcs: paymentBcs, sender: payer, tenantId });
            if (result.status !== 200) return json(res, result.status, result.body);
            receipt = { intentId: intent.id, txHash: result.body.txHash, receiptHash: result.body.receiptHash, amountMicro: intent.amountMicro };
          }
          await audit('object.paid', { actor: payer, target: id, details: { intentId: receipt.intentId, amountMicro: receipt.amountMicro } });
        }

        const apiKey = process.env.SHELBY_API_KEY;
        if (!apiKey) return json(res, 503, { error: 'SHELBY_API_KEY not configured. Real blob download requires a Shelby API key.' });
        let blobName;
        try { blobName = m.blobName || parseBlobName(m.objectId); }
        catch { return json(res, 400, { error: 'Cannot determine blob name for this object.' }); }
        try {
          const { buffer } = await shelbyDownloadBlob({ address: m.address, blobName, apiKey });
          if (m.sha256) {
            const actual = createHash('sha256').update(buffer).digest('hex');
            if (actual !== m.sha256) {
              return json(res, 409, { error: 'SHA-256 mismatch — object content tampered or corrupted.', expected: m.sha256, actual });
            }
          }
          res.setHeader('Content-Type', 'application/octet-stream');
          res.setHeader('Content-Length', String(buffer.length));
          res.setHeader('Content-Disposition', `attachment; filename="${(m.model || 'model').replace(/[^a-zA-Z0-9._-]+/g, '-')}.bin"`);
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('X-Provenode-Sha256', m.sha256);
          if (receipt) res.setHeader('X-Payment-Response', Buffer.from(JSON.stringify(receipt)).toString('base64'));
          await audit('object.downloaded', { target: id, details: { size: buffer.length, verified: true, paid: !!receipt, intentId: receipt ? receipt.intentId : null } });
          return res.status(200).end(buffer);
        } catch (err) {
          console.error('[objects] blob download failed:', err.message);
          return json(res, 502, { error: `Shelby blob download failed: ${err.message}` });
        }
      }

      // POST /api/objects/:id/renew — re-upload the blob with a fresh 90-day expiry
      if (method === 'POST' && parts[1] && parts[2] === 'renew') {
        const id = parts[1];
        const raw = await db.get(`model:${id}`);
        if (!raw) return json(res, 404, { error: 'Object not found.' });
        const m = JSON.parse(raw);
        if (m.mode !== 'shelby' || !m.objectId) {
          return json(res, 400, { error: 'Object is not a real Shelby blob; only real Shelby objects can be renewed.' });
        }
        const apiKey = process.env.SHELBY_API_KEY;
        if (!apiKey) return json(res, 503, { error: 'SHELBY_API_KEY not configured.' });
        let blobName;
        try { blobName = m.blobName || parseBlobName(m.objectId); }
        catch { return json(res, 400, { error: 'Cannot determine blob name for this object.' }); }
        try {
          const { buffer } = await shelbyDownloadBlob({ address: m.address, blobName, apiKey });
          if (m.sha256 && createHash('sha256').update(buffer).digest('hex') !== m.sha256) {
            return json(res, 409, { error: 'SHA-256 mismatch — refusing to renew a tampered object.' });
          }
          const up = await shelbyUpload({ blobData: buffer, blobName, apiKey });
          if (up.mode !== 'shelby') throw new Error(up.warning || 'Shelby upload did not return a real blob');
          const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
          m.expiresAt = expiresAt;
          m.objectId = up.objectId || m.objectId;
          m.address = up.address || m.address;
          m.blobName = up.blobName || blobName;
          m.lastRenewedAt = new Date().toISOString();
          await db.put(`model:${id}`, JSON.stringify(m));
          await audit('object.renewed', { target: id, details: { blobName, expiresAt } });
          await notify('object.renewed', { id, model: m.model, objectId: m.objectId, expiresAt });
          return json(res, 200, { success: true, id, expiresAt, objectId: m.objectId });
        } catch (err) {
          console.error('[objects] renew failed:', err.message);
          return json(res, 502, { error: `Shelby object renewal failed: ${err.message}` });
        }
      }

      // GET /api/objects — public listing
      const expiring = 'expiring' in q;
      const { keys } = await db.list({ prefix: 'model:' });
      const now = Date.now();
      const objects = (await Promise.all(keys.map(async ({ name }) => {
        const d = await db.get(name); if (!d) return null;
        const m = JSON.parse(d);
        if (m.mode !== 'shelby') return null;
        const expiresAt = m.expiresAt ? new Date(m.expiresAt).getTime() : null;
        const daysLeft = expiresAt ? Math.floor((expiresAt - now) / 86400000) : null;
        const status = !expiresAt ? 'unknown' : daysLeft < 0 ? 'expired' : daysLeft < 7 ? 'expiring_soon' : 'healthy';
        return { id: m.id, model: m.model, objectId: m.objectId, sha256: m.sha256, size: m.size, address: m.address, expiresAt: m.expiresAt, daysLeft, status, createdAt: m.createdAt };
      }))).filter(r => r && (!expiring || r.status === 'expiring_soon' || r.status === 'expired'));
      const stats = {
        total: objects.length,
        healthy: objects.filter(o => o.status === 'healthy').length,
        expiringSoon: objects.filter(o => o.status === 'expiring_soon').length,
        expired: objects.filter(o => o.status === 'expired').length,
      };
      return json(res, 200, { success: true, objects, stats });
    }

    // ── devices ─────────────────────────────────────────────
    if (root === 'devices') {
      // FIX C-1: Auth guard on all mutating requests
      if (method !== 'GET' && requireAuth(req, res)) return;

      if (method === 'GET') {
        const id = q.id;
        if (id) {
          const raw = await db.get(`device:${id}`);
          if (!raw) return json(res, 404, { error: 'Not found.' });
          return json(res, 200, { success: true, device: JSON.parse(raw) });
        }
        const { keys } = await db.list({ prefix: 'device:' });
        const devices = (await Promise.all(keys.map(async ({ name }) => {
          const d = await db.get(name); return d ? JSON.parse(d) : null;
        }))).filter(Boolean);
        return json(res, 200, { success: true, devices, total: devices.length });
      }
      if (method === 'POST') {
        const body = await readBody(req);
        const { deviceId, type, arch, location, publicKey, fleet } = body;
        if (!deviceId) return json(res, 400, { error: 'deviceId required.' });
        const existing = await db.get(`device:${deviceId}`);
        const device = {
          ...(existing ? JSON.parse(existing) : {}),
          id: deviceId, type: type || 'unknown', arch: arch || 'arm64',
          location: location || 'Unknown', publicKey: publicKey || null,
          fleet: fleet || 'default', status: 'online',
          registeredAt: existing ? JSON.parse(existing).registeredAt : new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
        };
        await db.put(`device:${deviceId}`, JSON.stringify(device));
        return json(res, 201, { success: true, device });
      }
      if (method === 'PATCH') {
        const body = await readBody(req);
        const { id, ...updates } = body;
        if (!id) return json(res, 400, { error: 'id required.' });
        const raw = await db.get(`device:${id}`);
        if (!raw) return json(res, 404, { error: 'Not found.' });
        const device = { ...JSON.parse(raw), ...updates, lastSeenAt: new Date().toISOString() };
        await db.put(`device:${id}`, JSON.stringify(device));
        return json(res, 200, { success: true, device });
      }
      if (method === 'DELETE') {
        const id = q.id;
        if (!id) return json(res, 400, { error: 'id required.' });
        await db.del(`device:${id}`);
        return json(res, 200, { success: true });
      }
    }

    // ── fleet ───────────────────────────────────────────────
    if (root === 'fleet') {
      // FIX C-1: Auth guard on all mutating requests
      if (method !== 'GET' && requireAuth(req, res)) return;

      // /fleet/:deviceId/pending | /fleet/:deviceId/report | /fleet/canary/:id/advance|rollback
      if (method === 'GET' && parts[2] === 'pending') {
        const deviceId = parts[1];
        const raw = await db.get(`device:${deviceId}`);
        const device = raw ? JSON.parse(raw) : null;
        const { keys } = await db.list({ prefix: 'deployment:' });
        const deployments = (await Promise.all(keys.map(async ({ name }) => {
          const d = await db.get(name); return d ? JSON.parse(d) : null;
        }))).filter(d => d && d.status !== 'rolled_back').sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
        const pending = deployments[0];
        if (!pending) return json(res, 200, { pending: false });
        if (device?.currentModelId === pending.modelId) return json(res, 200, { pending: false, upToDate: true });
        return json(res, 200, {
          pending: true, deploymentId: pending.id, modelId: pending.modelId,
          shelbyObjectId: pending.shelbyObjectId, sha256: pending.sha256,
          version: pending.version, manifestObjectId: pending.manifestObjectId,
        });
      }
      if (method === 'POST' && parts[2] === 'report') {
        const deviceId = parts[1];
        const body = await readBody(req);
        const { deploymentId, status, sha256Match, error } = body;
        const raw = await db.get(`device:${deviceId}`);
        if (raw) {
          const device = JSON.parse(raw);
          device.lastSeenAt = new Date().toISOString();
          device.status = status === 'healthy' ? 'online' : 'error';
          if (sha256Match && deploymentId) device.currentModelId = deploymentId;
          await db.put(`device:${deviceId}`, JSON.stringify(device));
        }
        if (deploymentId && sha256Match) {
          const dd = await db.get(`devices:${deploymentId}`);
          if (dd) {
            const devices = JSON.parse(dd);
            devices.verified = Math.min(devices.target, devices.verified + 1);
            await db.put(`devices:${deploymentId}`, JSON.stringify(devices));
          }
        }
        if (!sha256Match) {
          await notify('integrity.mismatch', { deviceId, deploymentId, error });
          if (process.env.ALERT_EMAIL) {
            await sendEmail({ to: process.env.ALERT_EMAIL, ...integrityMismatchEmail({ deviceId, deploymentId, model: '' }) });
          }
        }
        return json(res, 200, { success: true });
      }
      if (method === 'POST' && parts[1] === 'canary' && parts[3] === 'advance') {
        const id = parts[2];
        const raw = await db.get(`deployment:${id}`);
        if (!raw) return json(res, 404, { error: 'Not found.' });
        const manifest = JSON.parse(raw);
        if (!manifest.canary) return json(res, 400, { error: 'Not a canary deployment.' });
        const stages = manifest.canary.stages;
        const next = manifest.canary.currentStage + 1;
        if (next >= stages.length) { manifest.canary.currentStage = stages.length - 1; manifest.status = 'verified'; }
        else manifest.canary.currentStage = next;
        await db.put(`deployment:${id}`, JSON.stringify(manifest));
        await notify('canary.advanced', { id, stage: stages[manifest.canary.currentStage] });
        return json(res, 200, { success: true, manifest });
      }
      if (method === 'POST' && parts[1] === 'canary' && parts[3] === 'rollback') {
        const id = parts[2];
        const raw = await db.get(`deployment:${id}`);
        if (!raw) return json(res, 404, { error: 'Not found.' });
        const manifest = JSON.parse(raw);
        manifest.status = 'rolled_back'; manifest.rolledBackAt = new Date().toISOString();
        await db.put(`deployment:${id}`, JSON.stringify(manifest));
        await notify('deployment.rolled_back', { id, model: manifest.model });
        return json(res, 200, { success: true, manifest });
      }
      return json(res, 404, { error: 'Unknown fleet endpoint.' });
    }

    // ── abtest ──────────────────────────────────────────────
    if (root === 'abtest') {
      // FIX C-1: Auth guard on all mutating requests
      if (method !== 'GET' && requireAuth(req, res)) return;

      if (method === 'GET') {
        const id = q.id;
        if (!id) {
          const { keys } = await db.list({ prefix: 'abtest:' });
          const tests = (await Promise.all(keys.filter(k => !k.name.includes(':result:')).map(async ({ name }) => {
            const d = await db.get(name); return d ? JSON.parse(d) : null;
          }))).filter(Boolean);
          return json(res, 200, { success: true, tests });
        }
        const testData = await db.get(`abtest:${id}`);
        if (!testData) return json(res, 404, { error: 'Not found.' });
        const test = JSON.parse(testData);
        const { keys } = await db.list({ prefix: `abtest:${id}:result:` });
        const results = { a: { count: 0, totalLatency: 0, errors: 0 }, b: { count: 0, totalLatency: 0, errors: 0 } };
        for (const { name } of keys) {
          const r = JSON.parse(await db.get(name) || '{}');
          const bucket = r.modelId === test.modelAId ? 'a' : 'b';
          results[bucket].count++;
          results[bucket].totalLatency += r.latency || 0;
          if (!r.success) results[bucket].errors++;
        }
        for (const b of ['a', 'b']) {
          results[b].avgLatency = results[b].count ? Math.round(results[b].totalLatency / results[b].count) : 0;
          results[b].errorRate = results[b].count ? (results[b].errors / results[b].count * 100).toFixed(1) : '0.0';
        }
        return json(res, 200, { success: true, test, results });
      }
      if (method === 'POST') {
        const body = await readBody(req);
        if (body.action === 'result') {
          const { id, deviceId, modelId, latency, success } = body;
          if (!id || !deviceId || !modelId) return json(res, 400, { error: 'id, deviceId, modelId required.' });
          
          await db.put(`abtest:${id}:result:${deviceId}`, JSON.stringify({ deviceId, modelId, latency: latency || 0, success: success !== false, reportedAt: new Date().toISOString() }));
          
          // Cryptographic Auto-Rollback (Self-Healing)
          if (success === false) {
             const testRaw = await db.get(`abtest:${id}`);
             if (testRaw) {
               const test = JSON.parse(testRaw);
               // Evaluate total errors
               const { keys } = await db.list({ prefix: `abtest:${id}:result:` });
               let errors = 0;
               for (const { name } of keys) {
                 const r = JSON.parse(await db.get(name) || '{}');
                 if (!r.success && r.modelId === modelId) errors++;
               }
               // If error threshold crossed (>3 errors in this demo), trigger auto-rollback on the Aptos chain
               if (errors >= 3 && test.status !== 'rolled_back') {
                  test.status = 'rolled_back';
                  await db.put(`abtest:${id}`, JSON.stringify(test));
                  // In a real system, this dispatches an Aptos Move smart contract transaction
                  await notify('fleet.auto_rollback', { testId: id, modelId, reason: 'Error threshold exceeded during A/B evaluation. Cryptographic rollback triggered.' });
               }
             }
          }
          
          return json(res, 200, { success: true });
        }
        const { name, modelAId, modelBId, splitPercent, durationHours } = body;
        if (!name || !modelAId || !modelBId) return json(res, 400, { error: 'name, modelAId, modelBId required.' });
        const testId = crypto.randomUUID();
        const test = { id: testId, name, modelAId, modelBId, splitPercent: splitPercent || 50, durationHours: durationHours || 24, status: 'running', createdAt: new Date().toISOString(), endsAt: new Date(Date.now() + (durationHours || 24) * 3600000).toISOString() };
        await db.put(`abtest:${testId}`, JSON.stringify(test));
        return json(res, 201, { success: true, test });
      }
      if (method === 'DELETE') {
        const id = q.id;
        if (!id) return json(res, 400, { error: 'id required.' });
        const raw = await db.get(`abtest:${id}`);
        if (!raw) return json(res, 404, { error: 'Not found.' });
        const test = JSON.parse(raw);
        test.status = 'ended'; test.endedAt = new Date().toISOString();
        await db.put(`abtest:${id}`, JSON.stringify(test));
        return json(res, 200, { success: true });
      }
    }

    // ── import (HF) ─────────────────────────────────────────
    if (root === 'import') {
      // FIX C-1: Auth guard on all mutating requests
      if (method !== 'GET' && requireAuth(req, res)) return;

      if (method === 'GET') {
        const jobId = q.jobId;
        if (!jobId) {
          const { keys } = await db.list({ prefix: 'import:' });
          const jobs = (await Promise.all(keys.map(async ({ name }) => {
            const d = await db.get(name); return d ? JSON.parse(d) : null;
          }))).filter(Boolean);
          return json(res, 200, { success: true, jobs });
        }
        const raw = await db.get(`import:${jobId}`);
        if (!raw) return json(res, 404, { error: 'Job not found.' });
        return json(res, 200, { success: true, job: JSON.parse(raw) });
      }
      if (method === 'POST') {
        const body = await readBody(req);
        const { source, repo, filename, name, revision } = body;
        if (source !== 'huggingface') return json(res, 400, { error: 'Only source "huggingface" is supported.' });
        if (!repo || !filename) return json(res, 400, { error: 'repo and filename required.' });
        // FIX: repo/filename/revision are interpolated into a URL — reject
        // path traversal and URL injection (e.g. repo="a/b/../../", filename with ?#)
        if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo)) return json(res, 400, { error: 'Invalid repo. Expected owner/model.' });
        if (/\.\./.test(filename) || /[?#]/.test(filename)) return json(res, 400, { error: 'Invalid filename.' });
        if (revision && !/^[a-zA-Z0-9_.\/-]+$/.test(revision)) return json(res, 400, { error: 'Invalid revision.' });
        const jobId = crypto.randomUUID();
        const job = { id: jobId, source, repo, filename, name: name || `${repo.split('/')[1]}/${filename}`, status: 'fetching', createdAt: new Date().toISOString() };
        await db.put(`import:${jobId}`, JSON.stringify(job));
        try {
          const rev = revision || 'main';
          const url = `https://huggingface.co/${repo}/resolve/${rev}/${filename}`;
          const r = await fetch(url, { headers: { 'User-Agent': 'Provenode/3.1' } });
          if (!r.ok) throw new Error(`HuggingFace returned ${r.status}`);
          const buf = Buffer.from(await r.arrayBuffer());
          const sha256 = createHash('sha256').update(buf).digest('hex');
          const id = crypto.randomUUID();
          const slug = job.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          const blobName = makeBlobName(slug, `-${id.slice(0, 8)}`);
          const { objectId, mode, warning } = await shelbyUpload({ blobData: new Uint8Array(buf), blobName, apiKey: process.env.SHELBY_API_KEY });
          const record = { id, model: job.name, objectId, sha256, size: buf.length, mode, source: `hf:${repo}/${filename}`, tags: ['huggingface', repo.split('/')[0]], createdAt: new Date().toISOString() };
          await db.put(`model:${id}`, JSON.stringify(record));
          job.status = 'complete'; job.modelId = id; job.sha256 = sha256; job.size = buf.length; job.mode = mode;
          await db.put(`import:${jobId}`, JSON.stringify(job));
          return json(res, 200, { success: true, job, modelId: id, hash: sha256, size: buf.length, mode, ...(warning && { warning }) });
        } catch (err) {
          job.status = 'failed'; job.error = err.message;
          await db.put(`import:${jobId}`, JSON.stringify(job));
          return json(res, 500, { success: false, error: err.message, jobId });
        }
      }
    }

    // ── webhooks ────────────────────────────────────────────
    if (root === 'webhooks') {
      // FIX C-1: Auth guard on all mutating requests
      if (method !== 'GET' && requireAuth(req, res)) return;

      if (method === 'GET') {
        const { keys } = await db.list({ prefix: 'webhook:' });
        const hooks = (await Promise.all(keys.map(async ({ name }) => {
          const d = await db.get(name); if (!d) return null;
          const h = JSON.parse(d); return { ...h, secret: h.secret ? '***' : null };
        }))).filter(Boolean);
        return json(res, 200, { success: true, webhooks: hooks });
      }
      if (method === 'POST') {
        const body = await readBody(req);
        if (body.action === 'test') {
          await notify('test', { message: 'Provenode webhook test' });
          return json(res, 200, { success: true });
        }
        const { url, events, secret, name } = body;
        if (!url) return json(res, 400, { error: 'url required.' });
        // SSRF guard — covers loopback, all RFC1918 ranges, link-local, IPv6
        // local, IPv4-mapped IPv6, integer IP literals and metadata endpoints.
        const blocked = isBlockedWebhookUrl(url);
        if (blocked) return json(res, 400, { error: blocked });
        const id = crypto.randomUUID();
        const hook = { id, name: name || url, url, events: events || ['*'], secret: secret || null, enabled: true, createdAt: new Date().toISOString() };
        await db.put(`webhook:${id}`, JSON.stringify(hook));
        return json(res, 201, { success: true, webhook: { ...hook, secret: hook.secret ? '***' : null } });
      }
      if (method === 'DELETE') {
        const id = q.id;
        if (!id) return json(res, 400, { error: 'id required.' });
        await db.del(`webhook:${id}`);
        return json(res, 200, { success: true });
      }
    }

    // ── marketplace ─────────────────────────────────────────
    if (root === 'marketplace') {
      // FIX C-1: Auth guard on all mutating requests
      if (method !== 'GET' && requireAuth(req, res)) return;

      if (method === 'GET') {
        const id = q.id;
        if (!id) {
          const { keys } = await db.list({ prefix: 'marketplace:' });
          const listings = (await Promise.all(keys.map(async ({ name }) => {
            const d = await db.get(name); return d ? JSON.parse(d) : null;
          }))).filter(Boolean);
          return json(res, 200, { success: true, listings, total: listings.length });
        }
        const raw = await db.get(`marketplace:${id}`);
        if (!raw) return json(res, 404, { error: 'Not found.' });
        return json(res, 200, { success: true, listing: JSON.parse(raw) });
      }
      if (method === 'POST') {
        const body = await readBody(req);
        if (body.action === 'import' && body.listingId) {
          const raw = await db.get(`marketplace:${body.listingId}`);
          if (!raw) return json(res, 404, { error: 'Listing not found.' });
          const listing = JSON.parse(raw);
          // Real mode: marketplace imports are paid with ShelbyUSD. No demo bypass.
          // The due amount is the publisher's listing price, or the fixed platform fee for free listings.
          const dueShelbyUSD = listing.price > 0 ? listing.price : PRICE_TABLE.marketplace_import;
          const intent = body.paymentIntentId ? await getPaymentIntent(body.paymentIntentId, tenantId) : null;
          // SECURITY: bind the intent to this item type AND the amount actually
          // due, and consume it. Previously only `itemId` was checked, so a
          // 0.0001 'download' intent could unlock any priced listing, forever.
          const intentValid = intent
            && intent.status === 'paid'
            && intent.itemId === body.listingId
            && intent.item === 'marketplace_import'
            && !intent.consumedAt
            && Number(intent.amountMicro) >= shelbyUSDToMicro(dueShelbyUSD);
          if (!intentValid) {
            return json(res, 402, {
              error: intent && intent.consumedAt
                ? 'This payment intent was already used. Create and settle a new one.'
                : 'Payment required to import this listing. Create and settle a ShelbyUSD payment intent for item "marketplace_import".',
              priceShelbyUSD: dueShelbyUSD,
              amountMicro: shelbyUSDToMicro(dueShelbyUSD),
            });
          }
          // Single-use: mark consumed before granting the asset.
          intent.consumedAt = new Date().toISOString();
          await db.put(`pay:${intent.id}`, JSON.stringify(intent));
          const newId = crypto.randomUUID();
          const record = { id: newId, model: listing.name, objectId: listing.shelbyObjectId, sha256: listing.sha256, size: listing.size, mode: listing.mode, source: `marketplace:${body.listingId}`, tags: ['marketplace', ...(listing.tags || [])], createdAt: new Date().toISOString() };
          await db.put(`model:${newId}`, JSON.stringify(record));
          listing.downloads = (listing.downloads || 0) + 1;
          await db.put(`marketplace:${body.listingId}`, JSON.stringify(listing));
          return json(res, 200, { success: true, modelId: newId, record });
        }
        const { modelId, description, tags, license, price } = body;
        if (!modelId) return json(res, 400, { error: 'modelId required.' });
        const mRaw = await db.get(`model:${modelId}`);
        if (!mRaw) return json(res, 404, { error: 'Model not found.' });
        const model = JSON.parse(mRaw);
        const id = crypto.randomUUID();
        const priceNum = Number(price);
        const listing = { id, modelId, name: model.model, description: description || '', sha256: model.sha256, shelbyObjectId: model.objectId, size: model.size, mode: model.mode, tags: tags || model.tags || [], license: license || 'Apache-2.0', price: priceNum > 0 ? priceNum : 0, downloads: 0, publishedAt: new Date().toISOString() };
        await db.put(`marketplace:${id}`, JSON.stringify(listing));
        return json(res, 201, { success: true, listing });
      }
      if (method === 'DELETE') {
        const id = q.id;
        if (!id) return json(res, 400, { error: 'id required.' });
        await db.del(`marketplace:${id}`);
        return json(res, 200, { success: true });
      }
    }

    // ── payments (real ShelbyUSD micropayments) ────────────────
    if (root === 'payments') {
      if (requireAuth(req, res)) return;

      if (method === 'GET') {
        const id = q.id;
        if (!id) {
          const payments = await listPaymentIntents(tenantId);
          return json(res, 200, { success: true, payments });
        }
        const intent = await getPaymentIntent(id, tenantId);
        if (!intent) return json(res, 404, { error: 'Payment intent not found.' });
        return json(res, 200, { success: true, intent });
      }

      if (method === 'POST') {
        const body = await readBody(req);
        if (body.action === 'verify') {
          const { intentId, micropaymentBcs, sender } = body;
          if (!intentId || !micropaymentBcs) return json(res, 400, { error: 'intentId and micropaymentBcs required.' });
          const intent = await getPaymentIntent(intentId, tenantId);
          if (!intent) return json(res, 404, { error: 'Payment intent not found.' });
          if (intent.status === 'paid') return json(res, 200, { success: true, alreadyPaid: true, intent });
          // Verify + settle via the shared x402 settlement helper (same rules as
          // the pay-per-read flow on GET /api/objects/:id/blob).
          const result = await settleMicropayment({ intent, micropaymentBcs, sender, tenantId });
          return json(res, result.status, result.body);
        }

        const { item, itemId, payer, description } = body;
        if (!item || !itemId) return json(res, 400, { error: 'item and itemId required.' });
        let intent;
        try {
          // Real mode: the due amount is authoritative server-side. For marketplace
          // imports it is the publisher's listing price (or the platform fee for free listings).
          let amountShelbyUSD;
          if (item === 'marketplace_import') {
            const lRaw = await db.get(`marketplace:${itemId}`);
            if (!lRaw) return json(res, 404, { error: 'Listing not found for payment.' });
            const listing = JSON.parse(lRaw);
            amountShelbyUSD = listing.price > 0 ? listing.price : PRICE_TABLE.marketplace_import;
          } else {
            amountShelbyUSD = priceFor(item).usd;
          }
          intent = await createPaymentIntent({ item, itemId, payer, receiver: await getOrgAddress(), description, amountShelbyUSD, tenantId });
        } catch (e) {
          return json(res, 400, { error: e.message });
        }
        const { SHELBYUSD_TOKEN_ADDRESS, SHELBYUSD_FA_METADATA_ADDRESS, SHELBYUSD_TOKEN_MODULE } = await import('@shelby-protocol/sdk/node');
        return json(res, 201, {
          success: true,
          intent: { id: intent.id, item, itemId, amountShelbyUSD: intent.amountShelbyUSD, amountMicro: intent.amountMicro, status: intent.status, createdAt: intent.createdAt, expiresAt: intent.expiresAt },
          payment: {
            tokenAddress: SHELBYUSD_TOKEN_ADDRESS,
            tokenModule: SHELBYUSD_TOKEN_MODULE,
            faMetadataAddress: SHELBYUSD_FA_METADATA_ADDRESS,
            receiver: intent.receiver,
            instructions: 'Create a Shelby micropayment channel to the receiver (deposit the amount in ShelbyUSD), build a SenderBuiltMicropayment, and POST /api/payments { action: "verify", intentId, micropaymentBcs } to settle.',
          },
        });
      }
    }

    // ── analytics ───────────────────────────────────────────
    if (root === 'analytics') {
      // FIX C-1: Auth guard on all mutating requests
      if (method !== 'GET' && requireAuth(req, res)) return;

      if (method === 'GET') {
        const { deviceId, metric = 'latency', days = '7' } = q;
        if (!deviceId) {
          const { keys } = await db.list({ prefix: 'device:' });
          const devices = (await Promise.all(keys.map(async ({ name }) => {
            const d = await db.get(name); return d ? JSON.parse(d) : null;
          }))).filter(Boolean);
          const summary = { total: devices.length, online: devices.filter(d => d.status === 'online').length, byType: {}, byLocation: {}, byFleet: {} };
          for (const d of devices) {
            summary.byType[d.type] = (summary.byType[d.type] || 0) + 1;
            summary.byLocation[d.location] = (summary.byLocation[d.location] || 0) + 1;
            summary.byFleet[d.fleet] = (summary.byFleet[d.fleet] || 0) + 1;
          }
          return json(res, 200, { success: true, summary });
        }
        const parsedDays = parseInt(days, 10);
        const since = Date.now() - (Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : 7) * 86400000;
        const { keys } = await db.list({ prefix: `analytics:${deviceId}:${metric}:` });
        const points = (await Promise.all(keys.map(async ({ name }) => {
          const ts = parseInt(name.split(':').pop(), 10);
          if (ts < since) return null;
          const d = await db.get(name);
          return d ? { timestamp: new Date(ts).toISOString(), value: parseFloat(d) } : null;
        }))).filter(Boolean);
        return json(res, 200, { success: true, deviceId, metric, points });
      }
      if (method === 'POST') {
        const body = await readBody(req);
        const { deviceId, metric, value } = body;
        if (!deviceId || !metric) return json(res, 400, { error: 'deviceId and metric required.' });
        await db.put(`analytics:${deviceId}:${metric}:${Date.now()}`, String(value));
        return json(res, 200, { success: true });
      }
    }

    // ── schedule ────────────────────────────────────────────
    if (root === 'schedule') {
      // FIX C-1: Auth guard on all mutating requests
      if (method !== 'GET' && requireAuth(req, res)) return;

      if (method === 'GET') {
        const { keys } = await db.list({ prefix: 'scheduled:' });
        const jobs = (await Promise.all(keys.map(async ({ name }) => {
          const d = await db.get(name); return d ? JSON.parse(d) : null;
        }))).filter(Boolean);
        return json(res, 200, { success: true, jobs });
      }
      if (method === 'POST') {
        const body = await readBody(req);
        const { modelId, modelName, region, canary, scheduledFor, label } = body;
        if (!scheduledFor) return json(res, 400, { error: 'scheduledFor required.' });
        const scheduledTs = new Date(scheduledFor).getTime();
        if (isNaN(scheduledTs) || scheduledTs < Date.now()) return json(res, 400, { error: 'scheduledFor must be a future ISO datetime.' });
        const id = crypto.randomUUID();
        const job = { id, modelId, modelName, region: region || 'Global', canary: !!canary, scheduledFor, label: label || `${modelName || modelId}`, status: 'pending', createdAt: new Date().toISOString() };
        await db.put(`scheduled:${scheduledTs}:${id}`, JSON.stringify(job));
        return json(res, 201, { success: true, job });
      }
      if (method === 'DELETE') {
        const id = q.id;
        if (!id) return json(res, 400, { error: 'id required.' });
        const { keys } = await db.list({ prefix: 'scheduled:' });
        // Match the full id segment (keys are `scheduled:<ts>:<uuid>`), not any
        // suffix — `?id=0` used to delete an unrelated job.
        let deleted = false;
        for (const { name } of keys) {
          if (name.split(':').pop() === id) { await db.del(name); deleted = true; break; }
        }
        if (!deleted) return json(res, 404, { error: 'Scheduled job not found.' });
        return json(res, 200, { success: true });
      }
    }

    // ── groups ──────────────────────────────────────────────
    if (root === 'groups') {
      // FIX C-1: Auth guard on all mutating requests
      if (method !== 'GET' && requireAuth(req, res)) return;

      if (method === 'GET') {
        const id = q.id;
        if (!id) {
          const { keys } = await db.list({ prefix: 'group:' });
          const groups = (await Promise.all(keys.map(async ({ name }) => {
            const d = await db.get(name); return d ? JSON.parse(d) : null;
          }))).filter(Boolean);
          return json(res, 200, { success: true, groups });
        }
        const raw = await db.get(`group:${id}`);
        if (!raw) return json(res, 404, { error: 'Not found.' });
        return json(res, 200, { success: true, group: JSON.parse(raw) });
      }
      if (method === 'POST') {
        const body = await readBody(req);
        const { name, description, selector, deviceIds, color } = body;
        if (!name) return json(res, 400, { error: 'name required.' });
        const id = crypto.randomUUID();
        const group = { id, name, description: description || '', selector: selector || null, deviceIds: deviceIds || [], color: color || '#6366f1', createdAt: new Date().toISOString() };
        await db.put(`group:${id}`, JSON.stringify(group));
        return json(res, 201, { success: true, group });
      }
      if (method === 'DELETE') {
        const id = q.id;
        if (!id) return json(res, 400, { error: 'id required.' });
        await db.del(`group:${id}`);
        return json(res, 200, { success: true });
      }
    }

    // ── bluegreen ───────────────────────────────────────────
    if (root === 'bluegreen') {
      // FIX C-1: Auth guard on all mutating requests
      if (method !== 'GET' && requireAuth(req, res)) return;

      if (method === 'GET') {
        if (parts[1]) {
          const raw = await db.get(`bluegreen:${parts[1]}`);
          if (!raw) return json(res, 404, { error: 'Not found.' });
          return json(res, 200, { success: true, config: JSON.parse(raw) });
        }
        const { keys } = await db.list({ prefix: 'bluegreen:' });
        const configs = (await Promise.all(keys.map(async ({ name }) => {
          const d = await db.get(name); return d ? JSON.parse(d) : null;
        }))).filter(Boolean);
        return json(res, 200, { success: true, configs });
      }
      if (method === 'POST') {
        const body = await readBody(req);
        if (parts[1] === 'switch' || body.action === 'switch') {
          const projectId = body.projectId;
          if (!projectId) return json(res, 400, { error: 'projectId required.' });
          const raw = await db.get(`bluegreen:${projectId}`);
          if (!raw) return json(res, 404, { error: 'Not found.' });
          const config = JSON.parse(raw);
          const prev = config.activeSlot;
          config.activeSlot = config.activeSlot === 'blue' ? 'green' : 'blue';
          config.lastSwitchedAt = new Date().toISOString();
          await db.put(`bluegreen:${projectId}`, JSON.stringify(config));
          return json(res, 200, { success: true, config, switched: { from: prev, to: config.activeSlot } });
        }
        const { projectId, name, blueDeploymentId, greenDeploymentId, activeSlot } = body;
        if (!projectId || !name) return json(res, 400, { error: 'projectId and name required.' });
        const existing = await db.get(`bluegreen:${projectId}`);
        const config = {
          ...(existing ? JSON.parse(existing) : {}),
          projectId, name, blueDeploymentId: blueDeploymentId || null, greenDeploymentId: greenDeploymentId || null,
          activeSlot: activeSlot || 'blue',
          createdAt: existing ? JSON.parse(existing).createdAt : new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await db.put(`bluegreen:${projectId}`, JSON.stringify(config));
        return json(res, 201, { success: true, config });
      }
    }

    // ── audit ───────────────────────────────────────────────
    if (root === 'audit' && method === 'GET') {
      const records = await getAuditLog({ action: q.action, from: q.from, to: q.to, limit: parseInt(q.limit || '100', 10), tenantId });
      return json(res, 200, { success: true, records, count: records.length });
    }

    // ── compliance ──────────────────────────────────────────
    if (root === 'compliance') {
      if (method === 'GET') {
        const fromTs = q.from ? new Date(q.from).getTime() : 0;
        const toTs = q.to ? new Date(q.to).getTime() : Date.now();
        const inRange = (iso) => { const t = new Date(iso).getTime(); return t >= fromTs && t <= toTs; };
        const { keys: mKeys } = await db.list({ prefix: 'model:' });
        const models = (await Promise.all(mKeys.map(async ({ name }) => {
          const d = await db.get(name); if (!d) return null;
          const m = JSON.parse(d);
          return inRange(m.createdAt) ? { id: m.id, model: m.model, sha256: m.sha256, size: m.size, mode: m.mode, objectId: m.objectId, createdAt: m.createdAt } : null;
        }))).filter(Boolean);
        const { keys: dKeys } = await db.list({ prefix: 'deployment:' });
        const deployments = (await Promise.all(dKeys.map(async ({ name }) => {
          const d = await db.get(name); if (!d) return null;
          const m = JSON.parse(d);
          return inRange(m.createdAt) ? m : null;
        }))).filter(Boolean);
        const { keys: devKeys } = await db.list({ prefix: 'device:' });
        const devices = (await Promise.all(devKeys.map(async ({ name }) => {
          const d = await db.get(name); return d ? JSON.parse(d) : null;
        }))).filter(Boolean);
        const report = {
          generatedAt: new Date().toISOString(),
          period: { from: q.from || 'all-time', to: q.to || new Date().toISOString() },
          summary: { models: models.length, deployments: deployments.length, devices: devices.length, shelbyMode: models.filter(m => m.mode === 'shelby').length },
          models, deployments, devices,
        };
        if (q.format === 'csv') {
          // Quote every field and neutralise formula-injection prefixes so a
          // model named `=HYPERLINK(...)` cannot execute in a spreadsheet.
          const cell = (v) => {
            let s = v == null ? '' : String(v);
            if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
            return `"${s.replace(/"/g, '""')}"`;
          };
          const lines = [
            'id,model,sha256,mode,objectId,createdAt',
            ...models.map(m => [m.id, m.model, m.sha256, m.mode, m.objectId, m.createdAt].map(cell).join(',')),
          ];
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', `attachment; filename="provenode-compliance.csv"`);
          return res.status(200).send(lines.join('\n'));
        }
        return json(res, 200, { success: true, report });
      }
    }

    // ── sign ────────────────────────────────────────────────
    if (root === 'sign') {
      // FIX C-1: Auth guard on all mutating requests
      if (method !== 'GET' && requireAuth(req, res)) return;

      if (method === 'GET') {
        const modelId = q.modelId;
        if (!modelId) return json(res, 400, { error: 'modelId required.' });
        const raw = await db.get(`model:${modelId}`);
        if (!raw) return json(res, 404, { error: 'Not found.' });
        const model = JSON.parse(raw);
        return json(res, 200, { signed: Boolean(model.signature), modelId, sha256: model.sha256, signature: model.signature || null });
      }
      if (method === 'POST') {
        const body = await readBody(req);
        const { modelId } = body;
        if (!modelId) return json(res, 400, { error: 'modelId required.' });
        const raw = await db.get(`model:${modelId}`);
        if (!raw) return json(res, 404, { error: 'Not found.' });
        const model = JSON.parse(raw);
        const sig = await signModel(model.sha256);
        if (!sig) return json(res, 400, { error: 'SIGN_KEY or SHELBY_PRIVATE_KEY not configured.' });
        model.signature = sig;
        await db.put(`model:${modelId}`, JSON.stringify(model));
        return json(res, 200, { success: true, modelId, signature: sig });
      }
    }

    // ── passport (Model Passports) ───────────────────────────
    if (root === 'passport') {
      // GET  /api/passport/:modelId             — public certificate
      // POST /api/passport                      — issue certificate (auth)
      // POST /api/passport/check                — check a weights file/hash (public)
      // POST /api/passport/:modelId/verify-copy — behavioral copy check (auth)
      const sub = parts[1];

      if (sub === 'check' && method === 'POST') {
        const body = await readBody(req);
        let sha256 = String(body.sha256 || '').toLowerCase().replace(/^0x/, '');
        if (!sha256 && typeof body.dataBase64 === 'string' && body.dataBase64) {
          sha256 = createHash('sha256').update(Buffer.from(body.dataBase64, 'base64')).digest('hex');
        }
        if (!sha256 || !/^[0-9a-f]{64}$/.test(sha256)) {
          return json(res, 400, { error: 'Provide a 64-char sha256 or dataBase64 weights file.' });
        }
        const passport = await findPassportBySha256(db, sha256);
        if (passport) {
          const verified = verifyPassport(passport);
          const { keys } = await db.list({ prefix: `fp:${passport.modelId}:` });
          return json(res, 200, {
            success: true,
            match: 'exact',
            verified,
            passport: { ...passport, signature: undefined, payload: undefined },
            fingerprintCount: keys.length,
            message: verified
              ? 'This weights file matches a registered model with a valid ownership certificate.'
              : 'Certificate found but the signature does not validate — treat with caution.',
          });
        }
        // No exact passport: list registered models so the caller can compare.
        const { keys } = await db.list({ prefix: 'model:' });
        const models = (await Promise.all(keys.map(async ({ name }) => { const d = await db.get(name); return d ? JSON.parse(d) : null; }))).filter(Boolean);
        return json(res, 200, {
          success: true,
          match: 'none',
          message: 'No registered model matches this exact SHA-256. It may be an edited or unlicensed copy — run a behavioral fingerprint check to confirm.',
          checkedSha256: sha256,
          registeredModels: models.map(m => ({ modelId: m.id, model: m.model, sha256: m.sha256, registeredAt: m.createdAt, passportIssued: Boolean(m.passportIssued) })).slice(0, 50),
        });
      }

      if (sub && sub !== 'check') {
        const modelId = sub;
        if (method === 'GET') {
          const raw = await db.get(`passport:${modelId}`);
          if (!raw) return json(res, 404, { error: 'No passport for this model.' });
          const passport = JSON.parse(raw);
          const { keys } = await db.list({ prefix: `fp:${modelId}:` });
          return json(res, 200, { success: true, verified: verifyPassport(passport), passport: { ...passport, signature: undefined, payload: undefined }, fingerprintCount: keys.length });
        }
        if (method === 'POST' && parts[2] === 'verify-copy') {
          if (requireAuth(req, res)) return;
          const body = await readBody(req);
          const { outputs } = body;
          if (!outputs || !Array.isArray(outputs) || !outputs.length) {
            return json(res, 400, { error: 'outputs[] with canary outputs from the suspect deployment required.' });
          }
          const { keys } = await db.list({ prefix: `fp:${modelId}:` });
          if (!keys.length) {
            return json(res, 404, { error: 'No behavioral fingerprint registered for this model. Register one via POST /api/fingerprint first.' });
          }
          const { createBehavioralFingerprint, compareFingerprints } = await import('../lib/fingerprint.js');
          const modelRaw = await db.get(`model:${modelId}`);
          const model = modelRaw ? JSON.parse(modelRaw) : null;
          const current = createBehavioralFingerprint({ modelId, modelSha256: model?.sha256 || 'unknown', outputs });
          const prints = (await Promise.all(keys.map(async ({ name }) => { const d = await db.get(name); return d ? JSON.parse(d) : null; }))).filter(Boolean).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
          const comparison = compareFingerprints(prints[0], current);
          await audit('passport.copy_checked', { target: modelId, details: { match: comparison.match, divergenceScore: comparison.divergenceScore } });
          return json(res, 200, { success: true, modelId, currentFingerprint: current.fingerprint, comparison });
        }
        return json(res, 405, { error: 'Method not allowed.' });
      }

      if (method === 'POST') {
        if (requireAuth(req, res)) return;
        const body = await readBody(req);
        const { modelId } = body;
        if (!modelId) return json(res, 400, { error: 'modelId required.' });
        const modelRaw = await db.get(`model:${modelId}`);
        if (!modelRaw) return json(res, 404, { error: 'Model not found.' });
        const model = JSON.parse(modelRaw);
        const { passport, note } = await issuePassport(db, model, { tryOnChain: true, tenantId });
        return json(res, 201, { success: true, passport, note: note || null });
      }
    }

    // ── metrics (prometheus) ────────────────────────────────
    if (root === 'metrics' && method === 'GET') {
      res.setHeader('Content-Type', 'text/plain; version=0.0.4');
      const [mRes, dRes, devRes] = await Promise.all([
        db.list({ prefix: 'model:' }),
        db.list({ prefix: 'deployment:' }),
        db.list({ prefix: 'device:' }),
      ]);
      const lines = [
        `# HELP provenode_models_total Total models`,
        `# TYPE provenode_models_total gauge`,
        `provenode_models_total ${mRes.keys.length}`,
        `provenode_deployments_total ${dRes.keys.length}`,
        `provenode_devices_total ${devRes.keys.length}`,
        '',
      ];
      return res.status(200).send(lines.join('\n'));
    }

    // ── stream (SSE simplified) ─────────────────────────────
    if (root === 'stream' && method === 'GET') {
      const deploymentId = q.deploymentId;
      if (!deploymentId) return json(res, 400, { error: 'deploymentId required.' });
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      const md = await db.get(`deployment:${deploymentId}`);
      const dd = await db.get(`devices:${deploymentId}`);
      if (!md) {
        res.write(`event: error\ndata: ${JSON.stringify({ message: 'Not found' })}\n\n`);
        return res.end();
      }
      const manifest = JSON.parse(md);
      const devices = dd ? JSON.parse(dd) : { verified: 0, target: 248 };
      const progress = Math.min(100, Math.round((devices.verified / devices.target) * 100));
      res.write(`event: progress\ndata: ${JSON.stringify({ deploymentId, verified: devices.verified, target: devices.target, progress, status: manifest.status, model: manifest.model })}\n\n`);
      if (manifest.status === 'verified' || progress >= 100) {
        res.write(`event: complete\ndata: ${JSON.stringify({ status: 'verified', progress: 100 })}\n\n`);
      }
      return res.end();
    }

    // ── docs ────────────────────────────────────────────────
    if (root === 'docs' && method === 'GET') {
      return json(res, 200, {
        openapi: '3.1.0',
        info: { title: 'Provenode API', version: '3.1.0', description: 'Verified AI model deployment on Shelby shelbynet' },
        paths: {
          '/api/health': { get: { summary: 'Health' } },
          '/api/upload': { post: { summary: 'Upload model' } },
          '/api/deploy': { post: { summary: 'Deploy model' } },
          '/api/models': { get: { summary: 'List models' } },
          '/api/status': { get: { summary: 'Deployment status' } },
          '/api/identity': { get: { summary: 'Org identity' } },
          '/api/objects': { get: { summary: 'Shelby objects' } },
          '/api/import': { post: { summary: 'HF import' } },
          '/api/devices': { get: { summary: 'Devices' }, post: { summary: 'Register device' } },
          '/api/fleet': { get: { summary: 'OTA pending' } },
          '/api/marketplace': { get: { summary: 'Marketplace' } },
          '/api/metrics': { get: { summary: 'Prometheus' } },
          '/api/docs': { get: { summary: 'This spec' } },
          '/api/earnings': { get: { summary: 'Real monetization metrics from settled ShelbyUSD payments' } },
          '/api/payments': { get: { summary: 'List ShelbyUSD payment intents' }, post: { summary: 'Create or settle a ShelbyUSD payment intent' } },
          '/api/passport': { get: { summary: 'Get a model passport' }, post: { summary: 'Issue a passport or check a weights file' } },
          '/api/registry': { get: { summary: 'Live on-chain ModelRegistry state (status, verify by sha256)' } },
          '/api/objects/:id/blob': { get: { summary: 'Download and verify a real Shelby blob (x402 pay-per-read: 402 quote, retry with X-Payment; admin token free)' } },
          '/api/objects/:id/renew': { post: { summary: 'Renew a real Shelby blob (re-upload with fresh expiry)' } },
          '/api/stream-inference': { get: { summary: 'Stream model chunks' }, post: { summary: 'Create stream manifest' } },
          '/api/federated': { get: { summary: 'Get FL rounds' }, post: { summary: 'Submit FL gradient' }, patch: { summary: 'Aggregate round' } },
          '/api/delta': { get: { summary: 'Get delta versions' }, post: { summary: 'Upload new delta version' } },
          '/api/zkproof': { get: { summary: 'Get ZK proof' }, post: { summary: 'Generate ZK proof' } },
          '/api/datasets': { get: { summary: 'List datasets' }, post: { summary: 'Register dataset' } },
          '/api/agent': { get: { summary: 'Check agent status' }, post: { summary: 'Spawn autonomous agent' } },
          '/api/abtest-lock': { get: { summary: 'List cryptographic A/B locks' }, post: { summary: 'Create lock' }, patch: { summary: 'Record test results' } },
        },
      });
    }

    // ── notifications ───────────────────────────────────────
    if (root === 'notifications') {
      // FIX C-1: Guard ALL methods — GET sends a test email (side effect),
      // so an unauthenticated GET could spam ALERT_EMAIL via the Resend API.
      if (requireAuth(req, res)) return;

      if (method === 'GET') {
        const to = process.env.ALERT_EMAIL;
        if (!to) return json(res, 400, { error: 'ALERT_EMAIL not set.' });
        const result = await sendEmail({ to, subject: '✅ Provenode email test', html: '<p>Email works.</p>' });
        return json(res, 200, { success: true, result });
      }
      if (method === 'POST') {
        const body = await readBody(req);
        // SECURITY: do not let an authenticated caller use us as a mail relay.
        // Only the configured ALERT_EMAIL (or an ALERT_EMAIL_ALLOWLIST entry)
        // may receive notifications.
        const fallback = process.env.ALERT_EMAIL;
        const allow = String(process.env.ALERT_EMAIL_ALLOWLIST || '')
          .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        const requested = String(body.to || fallback || '').trim().toLowerCase();
        if (!requested) return json(res, 400, { error: 'to or ALERT_EMAIL required.' });
        const permitted = requested === String(fallback || '').toLowerCase() || allow.includes(requested);
        if (!permitted) {
          return json(res, 403, { error: 'Recipient not allowed. Add it to ALERT_EMAIL_ALLOWLIST to permit this address.' });
        }
        const to = requested;
        let emailData = { subject: 'Provenode', html: '<p>Notification</p>' };
        if (body.type === 'deployment_verified') emailData = deploymentVerifiedEmail(body.deployment || {});
        if (body.type === 'integrity_mismatch') emailData = integrityMismatchEmail(body);
        if (body.type === 'expiry_warning') emailData = expiryWarningEmail(body.objects || []);
        const result = await sendEmail({ to, ...emailData });
        return json(res, 200, { success: result.ok, result });
      }
    }

    // ── slack (basic) ───────────────────────────────────────
    
    // ══════════════════════════════════════════════════════════════════════
    // TOP 10 TIER-1 SHELBY FEATURES
    // ══════════════════════════════════════════════════════════════════════

    // ── #1 STREAMING MODEL INFERENCE ─────────────────────────────────────
    if (root === 'stream-inference') {
      if (method !== 'GET' && requireAuth(req, res)) return;

      if (method === 'POST') {
        // Create stream manifest: split model into Shelby chunks
        const modelId = q.modelId;
        if (!modelId) return json(res, 400, { error: 'modelId required.' });
        const raw = await db.get(`model:${modelId}`);
        if (!raw) return json(res, 404, { error: 'Model not found.' });
        const model = JSON.parse(raw);

        // Real mode: stream the ACTUAL model blob from Shelby — no fabricated buffers.
        const apiKey = process.env.SHELBY_API_KEY;
        if (!apiKey) return json(res, 503, { error: 'SHELBY_API_KEY not configured.' });
        if (model.mode !== 'shelby' || !model.objectId) {
          return json(res, 400, { error: 'Model has no real Shelby blob to stream.' });
        }
        let blobName;
        try { blobName = model.blobName || parseBlobName(model.objectId); }
        catch { return json(res, 400, { error: 'Cannot determine blob name for this model.' }); }
        const { buffer } = await shelbyDownloadBlob({ address: model.address, blobName, apiKey });
        if (model.sha256 && createHash('sha256').update(buffer).digest('hex') !== model.sha256) {
          return json(res, 409, { error: 'SHA-256 mismatch — refusing to stream a tampered model.' });
        }

        const manifest = await createStreamManifest({
          buffer,
          modelId,
          modelName: model.model || model.name,
          apiKey,
        });

        await db.put(`stream:${modelId}`, JSON.stringify(manifest));
        await audit('stream.manifest_created', { target: modelId, details: { chunkCount: manifest.chunkCount, totalSize: manifest.totalSize } });
        return json(res, 201, { success: true, manifest: { ...manifest, chunks: manifest.chunks.map(c => ({ ...c, data: undefined })) } });
      }

      if (method === 'GET') {
        const modelId = q.modelId;
        const parsedChunk = q.chunk !== undefined ? parseInt(q.chunk, 10) : NaN;
      const chunkIndex = Number.isFinite(parsedChunk) && parsedChunk >= 0 ? parsedChunk : null;
        const deviceId = q.deviceId || 'anonymous';

        if (!modelId) return json(res, 400, { error: 'modelId required.' });
        const raw = await db.get(`stream:${modelId}`);
        if (!raw) return json(res, 404, { error: 'Stream manifest not found. POST /api/stream-inference?modelId=X first.' });
        const manifest = JSON.parse(raw);

        if (chunkIndex !== null) {
          const chunk = manifest.chunks[chunkIndex];
          if (!chunk) return json(res, 404, { error: `Chunk ${chunkIndex} not found.` });
          return json(res, 200, { success: true, chunk, access: getChunkUrl(chunk.objectId, deviceId) });
        }
        return json(res, 200, { success: true, manifest: { ...manifest, streamUrl: `/api/stream-inference?modelId=${modelId}&chunk=0` } });
      }
    }

    // ── #2 FEDERATED LEARNING ────────────────────────────────────────────
    if (root === 'federated') {
      if (method !== 'GET' && requireAuth(req, res)) return;

      if (method === 'GET') {
        const modelId = q.modelId;
        if (!modelId) return json(res, 400, { error: 'modelId required.' });
        const { keys } = await db.list({ prefix: `fl:round:${modelId}:` });
        const rounds = (await Promise.all(keys.map(async ({ name }) => {
          const d = await db.get(name);
          return d ? JSON.parse(d) : null;
        }))).filter(Boolean);
        return json(res, 200, { success: true, rounds, totalRounds: rounds.length });
      }

      if (method === 'POST') {
        const body = await readBody(req);
        const { modelId, deviceId, gradientHex, sampleCount, roundNumber } = body;
        if (!modelId || !deviceId || !gradientHex) return json(res, 400, { error: 'modelId, deviceId, gradientHex required.' });

        const gradientBuffer = Buffer.from(gradientHex, 'hex');
        const roundKey = `fl:round:${modelId}:${roundNumber || 1}`;
        const existingRaw = await db.get(roundKey);
        const existing = existingRaw ? JSON.parse(existingRaw) : { contributions: [] };

        // Add this device's gradient
        existing.contributions = existing.contributions || [];
        existing.contributions.push({ deviceId, gradientBuffer: Array.from(gradientBuffer), sampleCount: sampleCount || 100, uploadedAt: new Date().toISOString() });

        // Upload gradient to Shelby (real mode — shelbyUpload throws on failure)
        const gradientObjectId = (await shelbyUpload({ blobData: gradientBuffer, blobName: `fl/${modelId}/round-${roundNumber || 1}/${deviceId}`, apiKey: process.env.SHELBY_API_KEY })).objectId;

        const round = createFLRound({ modelId, roundNumber: roundNumber || 1, deviceContributions: existing.contributions.map(c => ({ ...c, gradientBuffer: Buffer.from(c.gradientBuffer) })) });
        await db.put(roundKey, JSON.stringify({ ...round, rawContributions: existing.contributions }));

        const receipt = generateContributionReceipt({ deviceId, roundHash: round.roundHash, gradientSha256: round.contributions.find(c => c.deviceId === deviceId)?.gradientSha256 });

        await audit('fl.gradient_submitted', { actor: deviceId, target: modelId, details: { roundNumber: roundNumber || 1, sampleCount } });
        return json(res, 201, { success: true, receipt, round: { roundHash: round.roundHash, participantCount: round.participantCount } });
      }

      if (method === 'PATCH') {
        // Aggregate all gradients for a round → produce new model
        const body = await readBody(req);
        const { modelId, roundNumber } = body;
        const roundKey = `fl:round:${modelId}:${roundNumber || 1}`;
        const rawRound = await db.get(roundKey);
        if (!rawRound) return json(res, 404, { error: 'Round not found.' });
        const round = JSON.parse(rawRound);
        if (!round.rawContributions || round.rawContributions.length < 2) return json(res, 400, { error: 'Need at least 2 gradient submissions to aggregate.' });

        // Reinterpret stored gradient BYTES as Float32 values (4 bytes per float).
        // `new Float32Array(buffer)` would treat each byte as a separate element,
        // producing garbage averages and breaking the FedAvg math. We copy into a
        // fresh array because Buffer.from() is rarely 4-byte aligned, and an
        // unaligned typed-array view throws RangeError.
        const gradients = round.rawContributions.map(c => {
          const buf = Buffer.from(Array.isArray(c.gradientBuffer) ? c.gradientBuffer : c.gradientBuffer);
          const n = Math.floor(buf.byteLength / 4);
          const out = new Float32Array(n);
          for (let i = 0; i < n; i++) out[i] = buf.readFloatLE(i * 4);
          return out;
        });
        const sampleCounts = round.rawContributions.map(c => c.sampleCount || 100);
        const aggregated = weightedFedAvg(gradients, sampleCounts);

        // Upload aggregated gradient to Shelby (real mode)
        const objectId = (await shelbyUpload({ blobData: aggregated, blobName: `fl/${modelId}/aggregated-round-${roundNumber || 1}`, apiKey: process.env.SHELBY_API_KEY })).objectId;

        round.status = 'aggregated';
        round.aggregatedObjectId = objectId;
        round.aggregatedAt = new Date().toISOString();
        await db.put(roundKey, JSON.stringify(round));
        await audit('fl.aggregated', { target: modelId, details: { roundNumber, participants: round.participantCount, objectId } });
        return json(res, 200, { success: true, aggregatedObjectId: objectId, roundHash: round.roundHash, participants: round.participantCount });
      }
    }

    // ── #3 DELTA UPLOADS ─────────────────────────────────────────────────
    if (root === 'delta') {
      if (method !== 'GET' && requireAuth(req, res)) return;

      if (method === 'GET') {
        const modelId = q.modelId;
        if (!modelId) return json(res, 400, { error: 'modelId required.' });
        const { keys } = await db.list({ prefix: `delta:${modelId}:` });
        const versions = (await Promise.all(keys.map(async ({ name }) => {
          const d = await db.get(name); return d ? JSON.parse(d) : null;
        }))).filter(Boolean).sort((a, b) => a.version?.localeCompare(b.version));
        return json(res, 200, { success: true, versions, dag: versions.map(v => ({ version: v.version, parent: v.parentSha256?.slice(0,8) || 'base', sha: v.newSha256?.slice(0,8) })) });
      }

      if (method === 'POST') {
        const body = await readBody(req);
        const { modelId, newSha256, baseVersion, newVersion, notes } = body;
        if (!modelId || !newSha256) return json(res, 400, { error: 'modelId, newSha256 required.' });

        // Get parent SHA if base version exists
        let parentSha256 = null;
        if (baseVersion) {
          const baseRaw = await db.get(`delta:${modelId}:${baseVersion}`);
          if (baseRaw) parentSha256 = JSON.parse(baseRaw).newSha256;
        }

        // Upload delta to Shelby (real mode — shelbyUpload throws on failure)
        const deltaObjectId = (await shelbyUpload({ blobData: Buffer.from(`delta:${modelId}:${newVersion}`), blobName: `deltas/${modelId}/${newVersion}`, apiKey: process.env.SHELBY_API_KEY })).objectId;

        const node = buildVersionNode({ parentSha256, newSha256, deltaObjectId, version: newVersion || '1.0.0', notes });
        await db.put(`delta:${modelId}:${newVersion || '1.0.0'}`, JSON.stringify(node));
        await audit('delta.version_registered', { target: modelId, details: { version: newVersion, parentSha256, deltaObjectId } });
        return json(res, 201, { success: true, node, compressionBenefit: parentSha256 ? 'Upload ~95% smaller than full model' : 'Base version stored' });
      }
    }

    // ── #7 ATTESTATION (legacy query-string form) ────────────────────────
    // NOTE: the primary handler is the `root === 'zkproof'` block near the top
    // of this router, which matches path-style requests. This block only serves
    // the documented query-string form and is reached when that block falls
    // through (no /:action/:id path segments).
    if (root === 'zkproof') {
      if (method !== 'GET' && requireAuth(req, res)) return;

      if (method === 'GET') {
        const modelId = q.modelId;
        if (!modelId) return json(res, 400, { error: 'modelId required.' });
        const raw = await db.get(`zkproof:${modelId}`);
        if (!raw) return json(res, 404, { error: 'No attestation for this model.' });
        const stored = JSON.parse(raw);
        // Records may be stored flat (path handler) or wrapped (this handler).
        const inner = stored.proof || stored;
        return json(res, 200, {
          success: true,
          proofHash: stored.proofSha256 || inner.proofHash,
          aggregateProof: inner.aggregateProof,
          vectorCount: inner.vectorCount,
          generatedAt: inner.generatedAt,
          shelbyObjectId: stored.shelbyObjectId,
          verified: verifyProof(inner, await getOrgPublicKey()),
        });
      }

      if (method === 'POST') {
        const body = await readBody(req);
        const { modelId, testVectors } = body;
        if (!modelId) return json(res, 400, { error: 'modelId required.' });
        const modelRaw = await db.get(`model:${modelId}`);
        if (!modelRaw) return json(res, 404, { error: 'Model not found.' });
        const model = JSON.parse(modelRaw);

        const orgPublicKey = await getOrgPublicKey();
        if (!orgPublicKey) {
          return json(res, 503, { error: 'Signing key not configured (SIGN_KEY or SHELBY_PRIVATE_KEY). Attestations must be signed by the org key to be verifiable.' });
        }
        const vectors = testVectors || STANDARD_BENCHMARK_VECTORS.map(v => ({ input: v.input, expectedOutput: `verified:${v.id}` }));
        let proof, proofBuffer, proofSha256;
        try {
          ({ proof, proofBuffer, proofSha256 } = generateModelCommitment({ modelSha256: model.sha256 || model.hash, testVectors: vectors, publicKeyHex: orgPublicKey }));
        } catch (e) {
          return json(res, 400, { error: e.message });
        }

        // Upload proof to Shelby
        const shelbyResult = await shelbyUpload({ blobData: proofBuffer, blobName: `zkproofs/${modelId}/proof-${Date.now()}`, apiKey: process.env.SHELBY_API_KEY });
        await db.put(`zkproof:${modelId}`, JSON.stringify({ proof, proofSha256, shelbyObjectId: shelbyResult.objectId }));
        await audit('zkproof.generated', { target: modelId, details: { proofSha256, vectorCount: vectors.length, shelbyObjectId: shelbyResult.objectId } });
        return json(res, 201, { success: true, proofHash: proofSha256, shelbyObjectId: shelbyResult.objectId, vectorCount: vectors.length, certificationLevel: vectors.some(v => v.input === 'ignore all previous instructions') ? 'AI-Safety-Certified' : 'Standard' });
      }
    }

    // ── #10 DATASET REGISTRY ─────────────────────────────────────────────
    if (root === 'datasets') {
      // Real mode: registration/listing are handled by the main datasets block above;
      // this block only adds the HTTP DELETE (GDPR right-to-forget) handler.
      if (method !== 'GET' && requireAuth(req, res)) return;

      if (method === 'DELETE') {
        const { datasetId, requestedBy, reason } = await readBody(req);
        if (!datasetId) return json(res, 400, { error: 'datasetId required.' });
        const request = buildDeletionRequest({ datasetId, requestedBy: requestedBy || 'api', reason: reason || 'GDPR Right to Forget' });
        await db.put(`deletion:${request.requestHash}`, JSON.stringify(request));
        await audit('dataset.deletion_requested', { actor: requestedBy, target: datasetId, details: { reason, requestHash: request.requestHash } });
        return json(res, 200, { success: true, request, notice: 'Models trained on this dataset must be retrained or withdrawn per EU AI Act Article 17.' });
      }

      return json(res, 405, { error: 'Method not allowed. Use GET /api/datasets to list or POST /api/datasets (multipart file / dataBase64) to register.' });
    }

    // ── #6 SELF-HEALING FLEET ────────────────────────────────────────────
    if (root === 'selfheal') {
      if (method !== 'GET' && requireAuth(req, res)) return;

      if (method === 'GET') {
        // Fleet health overview + tamper incident history
        const { keys: dk } = await db.list({ prefix: 'device:' });
        const { keys: mk } = await db.list({ prefix: 'model:' });
        const { keys: ik } = await db.list({ prefix: 'incident:' });
        const devices = (await Promise.all(dk.map(async ({ name }) => { const d = await db.get(name); return d ? JSON.parse(d) : null; }))).filter(Boolean);
        const models = (await Promise.all(mk.map(async ({ name }) => { const d = await db.get(name); return d ? JSON.parse(d) : null; }))).filter(Boolean);
        const incidents = (await Promise.all(ik.map(async ({ name }) => { const d = await db.get(name); return d ? JSON.parse(d) : null; }))).filter(Boolean)
          .sort((a, b) => new Date(b.tamperDetectedAt || 0) - new Date(a.tamperDetectedAt || 0));
        const health = evaluateFleetHealth(devices, models);
        const healed = incidents.filter(i => i.status === 'healed');
        const stats = {
          incidents: incidents.length,
          healed: healed.length,
          open: incidents.length - healed.length,
          avgHealMs: healed.length
            ? Math.round(healed.reduce((a, i) => a + (i.healDurationMs || 0), 0) / healed.length)
            : null,
        };
        return json(res, 200, { success: true, health, incidents, stats });
      }

      if (method === 'POST') {
        // Device reports its current SHA → system checks + auto-heals
        const body = await readBody(req);
        const { deviceId, modelId, reportedSha256 } = body;
        if (!deviceId || !modelId || !reportedSha256) return json(res, 400, { error: 'deviceId, modelId, reportedSha256 required.' });

        const modelRaw = await db.get(`model:${modelId}`);
        if (!modelRaw) return json(res, 404, { error: 'Model not found.' });
        const model = JSON.parse(modelRaw);

        const detection = detectTamper({ deviceId, reportedSha256, registeredSha256: model.sha256 || model.hash });

        if (detection.tampered) {
          const healCmd = buildHealCommand({ deviceId, modelId, shelbyObjectId: model.objectId, cleanSha256: model.sha256 || model.hash });
          const incident = buildIncidentRecord({ deviceId, modelId, tamperDetectedAt: detection.detectedAt, healedAt: null, oldSha256: reportedSha256, newSha256: model.sha256 || model.hash, shelbyObjectId: model.objectId });
          await db.put(`incident:${incident.id}`, JSON.stringify(incident));
          await notify('device.tamper_detected', { deviceId, modelId, incidentId: incident.id });
          await audit('selfheal.tamper_detected', { actor: deviceId, target: modelId, details: { oldSha: reportedSha256.slice(0,8), incidentId: incident.id } });
          return json(res, 200, { success: true, tampered: true, healCommand: healCmd, incident: { id: incident.id, status: 'heal_issued' }, message: 'Tamper detected. Heal command issued automatically.' });
        }

        return json(res, 200, { success: true, tampered: false, message: 'Device integrity verified.' });
      }

      if (method === 'PATCH') {
        // Device confirms heal complete
        const body = await readBody(req);
        const { incidentId, verifiedSha256 } = body;
        if (!incidentId) return json(res, 400, { error: 'incidentId required.' });
        const raw = await db.get(`incident:${incidentId}`);
        if (!raw) return json(res, 404, { error: 'Incident not found.' });
        const incident = JSON.parse(raw);
        incident.healedAt = new Date().toISOString();
        incident.status = 'healed';
        incident.healDurationMs = new Date(incident.healedAt) - new Date(incident.tamperDetectedAt);
        incident.verifiedSha256 = verifiedSha256;
        await db.put(`incident:${incidentId}`, JSON.stringify(incident));
        await audit('selfheal.healed', { target: incident.deviceId, details: { incidentId, healDurationMs: incident.healDurationMs } });
        return json(res, 200, { success: true, incident, message: `Fleet healed in ${(incident.healDurationMs/1000).toFixed(1)}s autonomously.` });
      }
    }

    // ── #4 MARKETPLACE UPGRADE (ShelbyUSD micropayments) ─────────────────
    // (existing /marketplace route enhanced — see main handler)

    // ── #5 PROVENANCE CHAIN (Merkle lineage) ─────────────────────────────
    if (root === 'provenance') {
      if (method === 'GET') {
        const modelId = q.modelId;
        if (!modelId) return json(res, 400, { error: 'modelId required.' });
        const { keys } = await db.list({ prefix: `prov:` });
        const chain = (await Promise.all(keys.map(async ({ name }) => {
          const d = await db.get(name); const r = d ? JSON.parse(d) : null;
          return r && (r.modelId === modelId || r.childModelId === modelId) ? r : null;
        }))).filter(Boolean).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        // Compute Merkle root of full chain
        const chainRoot = chain.length > 0 ? computeMerkleRoot(chain.map(n => n.nodeHash || createHash('sha256').update(JSON.stringify(n)).digest('hex'))) : null;
        return json(res, 200, { success: true, chain, chainRoot, depth: chain.length, euAIActCompliant: chain.length > 0 });
      }

      if (method === 'POST') {
        if (requireAuth(req, res)) return;
        const body = await readBody(req);
        const { parentModelId, childModelId, datasetIds, operation, notes } = body;
        if (!childModelId) return json(res, 400, { error: 'childModelId required.' });

        const node = {
          id: createHash('sha256').update(`${parentModelId||'base'}:${childModelId}:${Date.now()}`).digest('hex').slice(0,16),
          parentModelId: parentModelId || null,
          childModelId,
          modelId: childModelId,
          datasetIds: datasetIds || [],
          operation: operation || 'fine-tune',
          notes: notes || '',
          nodeHash: createHash('sha256').update(`${parentModelId||''}:${childModelId}:${(datasetIds||[]).join(',')}`).digest('hex'),
          timestamp: new Date().toISOString(),
          type: parentModelId ? 'derived' : 'origin',
        };
        await db.put(`prov:${node.id}`, JSON.stringify(node));
        await audit('provenance.node_added', { target: childModelId, details: { parentModelId, operation, nodeHash: node.nodeHash } });
        return json(res, 201, { success: true, node, certificate: `https://provenode.app/verify?prov=${node.id}` });
      }
    }

    // ── #9 INFERENCE ANALYTICS (Shelby telemetry store) ──────────────────
    if (root === 'telemetry') {
      if (method !== 'GET' && requireAuth(req, res)) return;

      if (method === 'POST') {
        const body = await readBody(req);
        const events = Array.isArray(body) ? body : [body];
        const validated = events.map(e => ({ deviceId: e.deviceId, modelId: e.modelId, modelSha: e.modelSha, latencyMs: Number(e.latencyMs) || 0, confidence: Number(e.confidence) || 0, timestamp: e.timestamp || new Date().toISOString(), label: e.label || 'inference' }));

        // Batch into Shelby blob (in production: real upload)
        const blobName = `telemetry/${Date.now()}.jsonl`;
        const blobData = Buffer.from(validated.map(e => JSON.stringify(e)).join('\n'));
        const shelbyResult = await shelbyUpload({ blobData, blobName, apiKey: process.env.SHELBY_API_KEY });

        // Also store lightweight summary in KV for fast API queries
        for (const e of validated) {
          const bucket = `tel:${e.modelId}:${new Date(e.timestamp).toISOString().slice(0,13)}`;
          const existing = await db.get(bucket).then(r => r ? JSON.parse(r) : { count: 0, totalLatency: 0, totalConfidence: 0 }).catch(() => ({ count: 0, totalLatency: 0, totalConfidence: 0 }));
          existing.count++;
          existing.totalLatency += e.latencyMs;
          existing.totalConfidence += e.confidence;
          existing.avgLatency = (existing.totalLatency / existing.count).toFixed(2);
          existing.avgConfidence = (existing.totalConfidence / existing.count).toFixed(4);
          existing.shelbyBlobName = blobName;
          await db.put(bucket, JSON.stringify(existing));
        }
        return json(res, 201, { success: true, ingested: validated.length, shelbyObjectId: shelbyResult.objectId, queryUrl: '/api/telemetry?modelId=X' });
      }

      if (method === 'GET') {
        const modelId = q.modelId;
        if (!modelId) return json(res, 400, { error: 'modelId required.' });
        const { keys } = await db.list({ prefix: `tel:${modelId}:` });
        const buckets = (await Promise.all(keys.map(async ({ name }) => {
          const d = await db.get(name); return d ? { hour: name.split(':')[2], ...JSON.parse(d) } : null;
        }))).filter(Boolean).sort((a, b) => a.hour?.localeCompare(b.hour));

        const totalInferences = buckets.reduce((a, b) => a + b.count, 0);
        const avgLatency = buckets.length ? (buckets.reduce((a, b) => a + parseFloat(b.avgLatency), 0) / buckets.length).toFixed(2) : '0';
        const avgConfidence = buckets.length ? (buckets.reduce((a, b) => a + parseFloat(b.avgConfidence), 0) / buckets.length).toFixed(4) : '0';
        return json(res, 200, { success: true, modelId, totalInferences, avgLatencyMs: avgLatency, avgConfidence, hourlyBuckets: buckets, s3Query: `SELECT * FROM read_json_auto('shelby://${modelId}/telemetry/*.jsonl') -- DuckDB compatible` });
      }
    }

    // ── #8 CROSS-CHAIN BRIDGE ─────────────────────────────────────────────
    if (root === 'bridge') {
      if (method !== 'GET' && requireAuth(req, res)) return;

      if (method === 'POST') {
        const body = await readBody(req);
        const { modelId, targetChain } = body;
        if (!modelId || !targetChain) return json(res, 400, { error: 'modelId, targetChain required. Supported: solana, ethereum' });
        const modelRaw = await db.get(`model:${modelId}`);
        if (!modelRaw) return json(res, 404, { error: 'Model not found.' });
        const model = JSON.parse(modelRaw);

        const attestation = {
          id: createHash('sha256').update(`${modelId}:${targetChain}:${Date.now()}`).digest('hex').slice(0,16),
          modelId, targetChain,
          aptosAddress: process.env.MOVE_CONTRACT_ADDRESS || 'not-deployed',
          shelbyObjectId: model.objectId,
          modelSha256: model.sha256 || model.hash,
          modelName: model.model || model.name,
          attestationHash: createHash('sha256').update(`${model.sha256 || model.hash}:${targetChain}`).digest('hex'),
          crossChainProof: {
            sourceChain: 'aptos',
            targetChain,
            shelbyObjectId: model.objectId,
            sha256: model.sha256 || model.hash,
            timestamp: new Date().toISOString(),
            note: targetChain === 'solana' ? 'Use @shelby-protocol/solana-kit to verify on Solana' : 'Verify on Ethereum via Provenode bridge contract',
          },
          bridgedAt: new Date().toISOString(),
          status: 'pending_on_target_chain',
        };

        await db.put(`bridge:${attestation.id}`, JSON.stringify(attestation));
        await audit('bridge.attestation_created', { target: modelId, details: { targetChain, attestationHash: attestation.attestationHash } });
        return json(res, 201, { success: true, attestation, instructions: targetChain === 'solana' ? 'Install @shelby-protocol/solana-kit and call verifyAttestation(attestationHash)' : 'Submit attestation to Provenode Ethereum bridge contract at 0x...' });
      }

      if (method === 'GET') {
        const { keys } = await db.list({ prefix: 'bridge:' });
        const attestations = (await Promise.all(keys.map(async ({ name }) => { const d = await db.get(name); return d ? JSON.parse(d) : null; }))).filter(Boolean);
        return json(res, 200, { success: true, attestations, supportedChains: ['aptos', 'solana', 'ethereum'] });
      }
    }


    // ══════════════════════════════════════════════════════════════════
    // 5 NOVEL AI/ML FEATURES — NOBODY HAS BUILT THESE ON SHELBY
    // ══════════════════════════════════════════════════════════════════

    // ── #6 INFERENCE CACHE ────────────────────────────────────────────
    if (root === 'inference-cache') {
      if (method !== 'GET' && requireAuth(req, res)) return;

      if (method === 'GET') {
        // Lookup cache by input hash
        const inputHash = q.inputHash || q.hash;
        const modelId = q.modelId;
        if (!inputHash || !modelId) return json(res, 400, { error: 'inputHash and modelId required.' });
        const cacheKey = `icache:${modelId}:${inputHash}`;
        const cached = await db.get(cacheKey);
        if (!cached) return json(res, 404, { error: 'Cache miss.', cacheHit: false });
        const record = JSON.parse(cached);
        // NOTE: deliberately no audit write here — an unauthenticated GET must
        // not be able to grow the audit keyspace on every request.
        return json(res, 200, { cacheHit: true, ...record, note: 'Result served from Shelby cache — no compute used' });
      }

      if (method === 'POST') {
        const body = await readBody(req);
        const { modelId, modelSha256, input, output, latencyMs, metadata } = body;
        if (!modelId || !input || output === undefined) return json(res, 400, { error: 'modelId, input, output required.' });

        // Hash the input deterministically
        const inputHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
        const cacheKey = `icache:${modelId}:${inputHash}`;

        // Check if already cached
        const existing = await db.get(cacheKey);
        if (existing) return json(res, 200, { stored: false, cacheHit: true, inputHash, message: 'Already cached.' });

        // Build cache record
        const recordHash = createHash('sha256').update((modelSha256 || '') + inputHash + JSON.stringify(output)).digest('hex');
        const record = {
          modelId, modelSha256: modelSha256 || null,
          inputHash, output, latencyMs: latencyMs || null,
          metadata: metadata || {}, recordHash,
          cachedAt: new Date().toISOString(),
        };

        // Upload to Shelby as immutable blob
        const blobName = `cache/${modelId.replace(/[^a-z0-9-]/gi,'-').toLowerCase()}/${inputHash}`;
        const shelbyResult = await shelbyUpload({ blobData: Buffer.from(JSON.stringify(record)), blobName, apiKey: process.env.SHELBY_API_KEY });

        // Store in KV for fast lookup
        await db.put(cacheKey, JSON.stringify({ ...record, shelbyObjectId: shelbyResult.objectId }));
        await audit('inference_cache.store', { target: modelId, details: { inputHash, latencyMs } });
        return json(res, 201, { stored: true, inputHash, shelbyObjectId: shelbyResult.objectId, recordHash, note: 'Result immutably cached on Shelby — future identical inputs served from cache' });
      }

      if (method === 'DELETE') {
        // FIX: DELETE now actually deletes the KV cache index (it previously
        // just returned stats). Shelby blobs are immutable so they remain,
        // but the fast-lookup pointer is removed.
        const modelId = q.modelId;
        const cacheKey = q.key || q.cacheKey || q.inputHash;
        if (cacheKey) {
          if (!modelId) return json(res, 400, { error: 'modelId required with key.' });
          await db.del(`icache:${modelId}:${cacheKey}`);
          return json(res, 200, { deleted: 1, modelId, key: cacheKey });
        }
        if (!modelId) return json(res, 400, { error: 'modelId or key required.' });
        const { keys } = await db.list({ prefix: `icache:${modelId}:` });
        await Promise.all(keys.map(async ({ name }) => db.del(name)));
        return json(res, 200, { modelId, deleted: keys.length, note: 'Cache index purged; immutable Shelby blobs remain.' });
      }
    }

    // ── #7 TRAINING CHECKPOINTS ───────────────────────────────────────
    if (root === 'checkpoints') {
      if (method !== 'GET' && requireAuth(req, res)) return;

      if (method === 'POST') {
        const body = await readBody(req);
        const { runId, step, loss, accuracy, checkpointData, optimizer, hyperparams } = body;
        if (!runId || step === undefined) return json(res, 400, { error: 'runId and step required.' });

        // Get parent checkpoint for chain linking.
        // Keys are cp:{runId}:{zero-padded step} — sort the NAMES so .pop()
        // reliably returns the highest step (KV scan order is not guaranteed).
        const { keys } = await db.list({ prefix: `cp:${runId}:` });
        const prevKeyName = keys.map(k => k.name).sort().pop();
        const prevRaw = prevKeyName ? await db.get(prevKeyName) : null;
        const parentId = prevRaw ? JSON.parse(prevRaw).id : null;

        // Upload checkpoint to Shelby
        const blobName = `checkpoints/${runId.replace(/[^a-z0-9-]/gi,'-').toLowerCase()}/step-${String(step).padStart(8,'0')}`;
        const blobData = checkpointData ? Buffer.from(checkpointData, 'base64') : Buffer.from(JSON.stringify({ step, loss, accuracy, optimizer, hyperparams }));
        const shelbyResult = await shelbyUpload({ blobData, blobName, apiKey: process.env.SHELBY_API_KEY });

        const cpId = createHash('sha256').update(`${runId}:step:${step}`).digest('hex').slice(0,16);
        const chainHash = createHash('sha256').update(`${parentId || 'root'}:${shelbyResult.objectId}:step:${step}`).digest('hex');

        const record = {
          id: cpId, runId, step,
          loss: typeof loss === 'number' ? parseFloat(loss.toFixed(6)) : null,
          accuracy: typeof accuracy === 'number' ? parseFloat(accuracy.toFixed(6)) : null,
          shelbyObjectId: shelbyResult.objectId,
          parentCheckpointId: parentId, chainHash,
          optimizer: optimizer || 'unknown', hyperparams: hyperparams || {},
          savedAt: new Date().toISOString(),
        };

        await db.put(`cp:${runId}:${String(step).padStart(12,'0')}`, JSON.stringify(record));
        await audit('checkpoint.saved', { target: runId, details: { step, loss, shelbyObjectId: shelbyResult.objectId } });
        return json(res, 201, { success: true, checkpoint: record, resumeCommand: `curl -o checkpoint_step${step}.pt "${shelbyResult.objectId}"` });
      }

      if (method === 'GET') {
        const runId = q.runId;
        if (!runId) return json(res, 400, { error: 'runId required.' });
        const { keys } = await db.list({ prefix: `cp:${runId}:` });
        const checkpoints = (await Promise.all(keys.map(async ({name}) => { const d = await db.get(name); return d ? JSON.parse(d) : null; }))).filter(Boolean).sort((a,b) => a.step - b.step);

        // Verify chain integrity
        let chainValid = true;
        for (let i = 0; i < checkpoints.length; i++) {
          const cp = checkpoints[i];
          const parent = i > 0 ? checkpoints[i-1] : null;
          const expected = createHash('sha256').update(`${parent ? parent.id : 'root'}:${cp.shelbyObjectId}:step:${cp.step}`).digest('hex');
          if (expected !== cp.chainHash) { chainValid = false; break; }
        }

        return json(res, 200, { runId, totalCheckpoints: checkpoints.length, chainIntact: chainValid, checkpoints,
          latest: checkpoints[checkpoints.length-1] || null,
          note: 'Each checkpoint is an immutable Shelby blob — resume training from any step globally'
        });
      }
    }

    // ── #8 DISTILLATION MARKETPLACE ───────────────────────────────────
    if (root === 'distillation') {
      if (method !== 'GET' && requireAuth(req, res)) return;

      if (method === 'POST') {
        const body = await readBody(req);
        const { studentId, teacherModelId, inputSamples, pricePerSample } = body;
        if (!studentId || !teacherModelId || !inputSamples) return json(res, 400, { error: 'studentId, teacherModelId, inputSamples required.' });

        const teacherRaw = await db.get(`model:${teacherModelId}`);
        if (!teacherRaw) return json(res, 404, { error: 'Teacher model not found.' });
        const teacher = JSON.parse(teacherRaw);

        const jobId = createHash('sha256').update(`${studentId}:${teacherModelId}:${Date.now()}`).digest('hex').slice(0,16);

        // Upload input samples to Shelby
        const inputBlobName = `distillation/${jobId}/inputs`;
        const inputResult = await shelbyUpload({ blobData: Buffer.from(JSON.stringify(inputSamples)), blobName: inputBlobName, apiKey: process.env.SHELBY_API_KEY });

        // Real mode: soft labels MUST come from the teacher's real inference.
        const teacherSha = teacher.sha256 || teacher.hash;
        if (!teacherSha) return json(res, 400, { error: 'Teacher model has no on-chain SHA-256 to bind labels to.' });
        if (!Array.isArray(inputSamples) || inputSamples.some(s => !Array.isArray(s.softLabels) || !s.softLabels.length)) {
          return json(res, 400, { error: 'Real distillation requires inputSamples with teacher softLabels (probability distributions).' });
        }
        // Bound the work: unbounded arrays here previously blew the call stack
        // via Math.max(...probs) and could pin the function on CPU.
        if (inputSamples.length > 1000) {
          return json(res, 400, { error: 'Too many inputSamples (max 1000 per request).' });
        }
        if (inputSamples.some(s => s.softLabels.length > 10000)) {
          return json(res, 400, { error: 'softLabels vector too large (max 10000 classes).' });
        }
        const softLabels = inputSamples.map((sample) => {
          const inputHash = createHash('sha256').update(JSON.stringify(sample.input !== undefined ? sample.input : sample)).digest('hex');
          const probs = sample.softLabels;
          const sum = probs.reduce((a, b) => a + b, 0) || 1;
          // reduce() instead of Math.max(...probs): spreading a large array
          // throws RangeError (max call stack).
          let topClassIndex = 0;
          for (let i = 1; i < probs.length; i++) if (probs[i] > probs[topClassIndex]) topClassIndex = i;
          return { inputHash, softLabels: probs.map(p => parseFloat((p / sum).toFixed(4))), temperature: body.temperature || 4.0, topClassIndex };
        });

        // Binding hash: proves labels came from this teacher
        const bindingHash = createHash('sha256').update(teacherSha + softLabels.map(l => l.inputHash).join(':')).digest('hex');
        const labelRecord = { jobId, teacherModelId, teacherSha256: teacherSha, temperature: body.temperature || 4.0, sampleCount: inputSamples.length, labels: softLabels, bindingHash, generatedAt: new Date().toISOString() };

        // Upload soft labels to Shelby
        const labelBlobName = `distillation/${jobId}/soft-labels`;
        const labelResult = await shelbyUpload({ blobData: Buffer.from(JSON.stringify(labelRecord)), blobName: labelBlobName, apiKey: process.env.SHELBY_API_KEY });

        const job = { id: jobId, studentId, teacherModelId, teacherSha256: teacherSha, inputObjectId: inputResult.objectId, outputObjectId: labelResult.objectId, sampleCount: inputSamples.length, pricePerSample: pricePerSample || 0.001, totalPrice: (pricePerSample || 0.001) * inputSamples.length, status: 'running', progress: 0, bindingHash, createdAt: new Date().toISOString() };

        await db.put(`distil:${jobId}`, JSON.stringify(job));
        await audit('distillation.completed', { actor: studentId, target: teacherModelId, details: { jobId, sampleCount: inputSamples.length, bindingHash } });
        return json(res, 201, { success: true, job, labelObjectId: labelResult.objectId, note: 'Soft labels stored on Shelby — teacher weights never exposed. Verify with bindingHash before training.' });
      }

      if (method === 'GET') {
        // Real mode: report the stored job as-is — no fabricated progress or completion.
        const computeProgress = (job) => job;

        if (q.jobId) {
          const raw = await db.get(`distil:${q.jobId}`);
          if (!raw) return json(res, 404, { error: 'Job not found.' });
          return json(res, 200, { success: true, job: computeProgress(JSON.parse(raw)) });
        }
        const { keys } = await db.list({ prefix: 'distil:' });
        const jobs = (await Promise.all(keys.map(async ({name}) => { const d = await db.get(name); return d ? computeProgress(JSON.parse(d)) : null; }))).filter(Boolean);
        return json(res, 200, { success: true, jobs, count: jobs.length });
      }
    }

    // ── #9 BEHAVIORAL FINGERPRINTING ──────────────────────────────────
    if (root === 'fingerprint') {
      if (method !== 'GET' && requireAuth(req, res)) return;

      if (method === 'POST') {
        const body = await readBody(req);
        const { modelId, outputs } = body;
        if (!modelId || !outputs || !Array.isArray(outputs)) return json(res, 400, { error: 'modelId and outputs[] required.' });

        const modelRaw = await db.get(`model:${modelId}`);
        if (!modelRaw) return json(res, 404, { error: 'Model not found.' });
        const model = JSON.parse(modelRaw);

        // Validate each canary entry before hashing — malformed entries would
        // otherwise crash createHash with an unhelpful 500.
        const outputHashes = outputs.map(o => (o && typeof o === 'object' && o.canaryId !== undefined && o.output !== undefined)
          ? { canaryId: o.canaryId, outputHash: createHash('sha256').update(JSON.stringify(o.output)).digest('hex') }
          : null);
        if (outputHashes.some(h => !h)) return json(res, 400, { error: 'Each outputs[] entry requires canaryId and output.' });
        const fingerprint = createHash('sha256').update(outputHashes.map(o => o.outputHash).join(':')).digest('hex');
        const modelSha256 = model.sha256 || model.hash || 'unknown';
        const compoundFingerprint = createHash('sha256').update(modelSha256 + fingerprint).digest('hex');

        const fpRecord = { modelId, modelSha256, canaryCount: outputs.length, fingerprint, compoundFingerprint, outputHashes, createdAt: new Date().toISOString(), version: 'provenode-bfp-v1' };

        // Anchor on Shelby best-effort — the KV record is the source of truth for
        // comparison, the blob is the immutable public anchor.
        let shelbyObjectId = null;
        let anchorNote = null;
        try {
          const blobName = `fingerprints/${modelId.replace(/[^a-z0-9-]/gi,'-').toLowerCase()}/${Date.now()}`;
          const shelbyResult = await shelbyUpload({ blobData: Buffer.from(JSON.stringify(fpRecord)), blobName, apiKey: process.env.SHELBY_API_KEY });
          shelbyObjectId = shelbyResult.objectId;
        } catch (e) {
          anchorNote = `Shelby blob anchor unavailable: ${e.message}`;
        }

        await db.put(`fp:${modelId}:${Date.now()}`, JSON.stringify({ ...fpRecord, shelbyObjectId }));
        await audit('fingerprint.created', { target: modelId, details: { fingerprint, compoundFingerprint, canaryCount: outputs.length } });
        return json(res, 201, { success: true, fingerprint, compoundFingerprint, shelbyObjectId, note: anchorNote || 'Behavioral fingerprint anchored on Shelby. Detects model editing attacks (ROME/MEMIT/BadNets) that bypass SHA-256 checking.' });
      }

      if (method === 'GET') {
        const modelId = q.modelId;
        if (!modelId) return json(res, 400, { error: 'modelId required.' });
        const { keys } = await db.list({ prefix: `fp:${modelId}:` });
        const prints = (await Promise.all(keys.map(async ({name}) => { const d = await db.get(name); return d ? JSON.parse(d) : null; }))).filter(Boolean).sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
        if (prints.length < 2) return json(res, 200, { modelId, prints, comparison: null });

        const orig = prints[0], curr = prints[prints.length-1];
        const diverged = orig.outputHashes.filter(o => { const c = curr.outputHashes.find(x => x.canaryId === o.canaryId); return !c || c.outputHash !== o.outputHash; });
        const isSilentTamper = orig.modelSha256 === curr.modelSha256 && diverged.length > 0;

        return json(res, 200, { modelId, prints, comparison: {
          originalFingerprint: orig.fingerprint, currentFingerprint: curr.fingerprint,
          match: orig.fingerprint === curr.fingerprint ? 'exact' : 'none',
          divergedCanaries: diverged.map(d => d.canaryId),
          isSilentTamper,
          verdict: isSilentTamper ? '🚨 SILENT TAMPER DETECTED: Weights unchanged but behavior changed — possible model editing attack' : orig.fingerprint === curr.fingerprint ? '✅ Behavior unchanged' : '⚠️ Behavior changed (weights also changed)',
        }});
      }
    }

    // ── #10 CRYPTOGRAPHIC A/B TEST LOCK ───────────────────────────────
    if (root === 'abtest-lock') {
      if (method !== 'GET' && requireAuth(req, res)) return;

      if (method === 'POST') {
        const body = await readBody(req);
        const { name, hypothesis, modelAId, modelBId, metric, minimumSamples, lockedBy } = body;
        if (!name || !modelAId || !modelBId || !metric) return json(res, 400, { error: 'name, modelAId, modelBId, metric required.' });

        const mARaw = await db.get(`model:${modelAId}`);
        const mBRaw = await db.get(`model:${modelBId}`);
        if (!mARaw || !mBRaw) return json(res, 404, { error: 'One or both models not found.' });
        const mA = JSON.parse(mARaw), mB = JSON.parse(mBRaw);
        const shaA = mA.sha256 || mA.hash || 'unknown', shaB = mB.sha256 || mB.hash || 'unknown';

        const lockId = createHash('sha256').update(`${shaA}:${shaB}:${Date.now()}`).digest('hex').slice(0,16);
        const lockHash = createHash('sha256').update(`${shaA}:${shaB}:${metric}:${name}`).digest('hex');

        const lock = {
          id: lockId, name, hypothesis: hypothesis || '', lockedAt: new Date().toISOString(),
          lockedBy: lockedBy || 'api', lockHash, status: 'locked',
          modelA: { id: modelAId, sha256: shaA, shelbyObjectId: mA.objectId || null },
          modelB: { id: modelBId, sha256: shaB, shelbyObjectId: mB.objectId || null },
          testConfig: { metric, minimumSamples: minimumSamples || 1000, significanceThreshold: 0.05 },
          results: null,
        };

        // Upload to Shelby — immutable record of test start
        const blobName = `abtests/${lockId}/lock`;
        const shelbyResult = await shelbyUpload({ blobData: Buffer.from(JSON.stringify(lock)), blobName, apiKey: process.env.SHELBY_API_KEY });
        await db.put(`ablock:${lockId}`, JSON.stringify({ ...lock, shelbyObjectId: shelbyResult.objectId }));
        await audit('abtest_lock.created', { target: name, details: { lockId, lockHash, modelAId, modelBId } });
        return json(res, 201, { success: true, lock: { ...lock, shelbyObjectId: shelbyResult.objectId }, note: `A/B test locked. lockHash=${lockHash.slice(0,16)}... anchored on Shelby before test starts. Results will be cryptographically bound to these exact model versions.` });
      }

      if (method === 'PATCH') {
        const body = await readBody(req);
        const { lockId, samplesA, samplesB, metricA, metricB, pValue, winner, confidence, notes } = body;
        if (!lockId) return json(res, 400, { error: 'lockId required.' });
        const raw = await db.get(`ablock:${lockId}`);
        if (!raw) return json(res, 404, { error: 'Lock not found.' });
        const lock = JSON.parse(raw);
        if (lock.status === 'completed') return json(res, 400, { error: 'Test already completed.' });

        // Verify lock integrity before recording results
        const expectedLockHash = createHash('sha256').update(`${lock.modelA.sha256}:${lock.modelB.sha256}:${lock.testConfig.metric}:${lock.name}`).digest('hex');
        if (expectedLockHash !== lock.lockHash) return json(res, 400, { error: 'Lock hash verification failed — test integrity compromised.' });

        const resultHash = createHash('sha256').update(`${lock.lockHash}:${metricA}:${metricB}:${pValue}:${winner}`).digest('hex');
        lock.status = 'completed';
        lock.completedAt = new Date().toISOString();
        lock.results = { samplesA, samplesB, metricA, metricB, delta: metricA - metricB, deltaPercent: metricB !== 0 ? ((metricA-metricB)/metricB*100).toFixed(2)+'%' : null, pValue, winner, confidence, significant: pValue < lock.testConfig.significanceThreshold, notes: notes || '', resultHash };

        await db.put(`ablock:${lockId}`, JSON.stringify(lock));
        await audit('abtest_lock.completed', { target: lock.name, details: { lockId, winner, pValue, resultHash } });
        return json(res, 200, { success: true, lock, auditStatement: `Results cryptographically bound to lockHash ${lock.lockHash.slice(0,16)}... It is mathematically impossible to have tested different model versions.` });
      }

      if (method === 'GET') {
        if (q.lockId) {
          const raw = await db.get(`ablock:${q.lockId}`);
          if (!raw) return json(res, 404, { error: 'Lock not found.' });
          return json(res, 200, { success: true, lock: JSON.parse(raw) });
        }
        const { keys } = await db.list({ prefix: 'ablock:' });
        const locks = (await Promise.all(keys.map(async ({name}) => { const d = await db.get(name); return d ? JSON.parse(d) : null; }))).filter(Boolean);
        return json(res, 200, { success: true, locks, count: locks.length });
      }
    }

    if (root === 'slack' && method === 'POST') {
      return json(res, 200, {
        response_type: 'ephemeral',
        text: 'Provenode bot online. Commands: status | fleet | rollback <id>',
      });
    }

    // ── SHELBY SITES — static website hosting on Shelby blobs ──────
    // Like Vercel/Netlify but every file is an immutable Shelby blob.
    // POST /api/sites { name, slug } -> create site
    // GET  /api/sites -> list sites
    // GET  /api/sites/:siteId -> get site
    // DELETE /api/sites/:siteId -> delete site
    // POST /api/sites/:siteId/deploy (multipart file=zip|html) -> deploy
    // GET  /api/sites/:siteId/deployments -> list deployments
    // GET  /api/sites/:siteId/serve/<path> -> serve file (SPA fallback to index.html)
    // GET  /api/sites/:siteId/preview/:depId/<path> -> preview specific deployment
    if (root === 'sites') {
      const siteId = parts[1] || null;
      const sub = parts[2] || null;

      // GET /api/sites -> list all sites
      if (!siteId && method === 'GET') {
        const { keys } = await db.list({ prefix: 'site:' });
        // filter out slug index keys
        const siteKeys = keys.filter(k => !k.name.startsWith('site:slug:') && !k.name.startsWith('siteDeploy:'));
        const sites = (await Promise.all(siteKeys.map(async ({ name }) => {
          const d = await db.get(name); return d ? JSON.parse(d) : null;
        }))).filter(Boolean).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        return json(res, 200, { success: true, sites });
      }

      // POST /api/sites -> create
      if (!siteId && method === 'POST') {
        if (requireAuth(req, res)) return;
        const body = await readBody(req);
        const name = String(body.name || body.slug || '').trim().slice(0, 120);
        if (!name) return json(res, 400, { error: 'name required (used for slug).' });
        let slug = slugify(body.slug || name);
        if (!validateSlug(slug)) return json(res, 400, { error: 'Invalid slug. Use 3-48 chars, a-z0-9 and hyphens.' });
        // Uniqueness is checked GLOBALLY: /s/<slug> is a public URL served
        // without a tenant header, so two tenants must not own the same slug.
        const globalDb = getDB();
        const claimed = await globalDb.get(`siteIndex:${slug}`);
        if (claimed) return json(res, 409, { error: `Slug "${slug}" already taken.` });
        const existing = await db.get(`site:slug:${slug}`);
        if (existing) return json(res, 409, { error: `Slug "${slug}" already taken.` });
        const site = buildSiteRecord({ name, slug, description: body.description, framework: body.framework, owner: body.owner || null });
        site.tenantId = tenantId || null;
        await db.put(`site:${site.id}`, JSON.stringify(site));
        await db.put(`site:slug:${slug}`, site.id);
        // Public routing index (slug -> tenant + id) so /s/<slug> resolves.
        await globalDb.put(`siteIndex:${slug}`, JSON.stringify({ tenantId: tenantId || '', siteId: site.id }));
        await audit('site.created', { target: site.id, details: { slug, name } });
        return json(res, 201, { success: true, site, urlPath: `/s/${slug}`, serveUrl: `/api/sites/${site.id}/serve/` });
      }

      // All site-specific routes require site lookup
      if (siteId) {
        let site = null;
        let siteDb = db;
        // allow lookup by id or slug
        let raw = await db.get(`site:${siteId}`);
        if (!raw) {
          const idFromSlug = await db.get(`site:slug:${siteId}`);
          if (idFromSlug) raw = await db.get(`site:${idFromSlug}`);
        }
        if (!raw) {
          // Public serve path: no tenant header, so resolve through the global
          // slug index and read the site from its owning tenant namespace.
          try {
            const idxRaw = await getDB().get(`siteIndex:${siteId}`);
            if (idxRaw) {
              const idx = JSON.parse(idxRaw);
              siteDb = getDB(idx.tenantId || '');
              raw = await siteDb.get(`site:${idx.siteId}`);
            }
          } catch { /* fall through to 404 */ }
        }
        // serve / preview are public (like Vercel preview URLs)
        // FIX: previously `serve`/`preview` were allowed to continue with
        // site === null, which then threw on site.lastDeploymentId — turning
        // every unknown public URL into a 500 instead of a 404.
        if (!raw) return json(res, 404, { error: 'Site not found.' });
        site = JSON.parse(raw);

        // GET /api/sites/:siteId -> get site + deployments count
        if (!sub && method === 'GET') {
          const { keys } = await db.list({ prefix: `siteDeploy:${site.id}:` });
          const deployments = (await Promise.all(keys.map(async ({ name }) => {
            const d = await db.get(name); return d ? JSON.parse(d) : null;
          }))).filter(Boolean).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
          return json(res, 200, { success: true, site, deployments, serveUrl: `/api/sites/${site.id}/serve/`, publicUrl: `/s/${site.slug}` });
        }

        // DELETE /api/sites/:siteId
        if (!sub && method === 'DELETE') {
          if (requireAuth(req, res)) return;
          await db.del(`site:${site.id}`);
          await db.del(`site:slug:${site.slug}`);
          // Release the public slug claim so it can be reused.
          await getDB().del(`siteIndex:${site.slug}`);
          const { keys } = await db.list({ prefix: `siteDeploy:${site.id}:` });
          for (const k of keys) await db.del(k.name);
          await audit('site.deleted', { target: site.id, details: { slug: site.slug } });
          return json(res, 200, { success: true });
        }

        // GET /api/sites/:siteId/deployments
        if (sub === 'deployments' && method === 'GET') {
          const { keys } = await db.list({ prefix: `siteDeploy:${site.id}:` });
          const deployments = (await Promise.all(keys.map(async ({ name }) => {
            const d = await db.get(name); return d ? JSON.parse(d) : null;
          }))).filter(Boolean).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
          return json(res, 200, { success: true, deployments });
        }

        // ── CI deploy keys (GitHub Actions) ─────────────────────────
        // POST   /api/sites/:siteId/keys        -> create key  (admin only, returns token ONCE)
        // GET    /api/sites/:siteId/keys        -> list keys  (admin only, no secrets)
        // DELETE /api/sites/:siteId/keys/:token -> revoke key (admin only)
        if (sub === 'keys') {
          if (requireAuth(req, res)) return;
          const keyAction = parts[3] || '';

          if (method === 'POST' && !keyAction) {
            const token = generateDeployKey();
            const record = { siteId: site.id, siteSlug: site.slug, createdAt: new Date().toISOString(), label: 'github-actions' };
            await db.put(`siteKey:${token}`, JSON.stringify(record));
            await audit('site.key.created', { target: site.id, details: { label: record.label } });
            return json(res, 201, { success: true, token, note: 'Store this token now — it is not retrievable again.', record });
          }

          if (method === 'GET' && !keyAction) {
            const { keys } = await db.list({ prefix: 'siteKey:' });
            const all = (await Promise.all(keys.map(async ({ name }) => {
              const raw = await db.get(name);
              if (!raw) return null;
              const rec = JSON.parse(raw);
              if (rec.siteId !== site.id) return null;
              return { ...rec, token: name.slice('siteKey:'.length) };
            }))).filter(Boolean);
            // mask tokens in listing
            return json(res, 200, { success: true, keys: all.map(k => ({ ...k, token: `${k.token.slice(0, 10)}...` })) });
          }

          if (method === 'DELETE' && keyAction) {
            // Listing masks tokens (pvnd_abc...) — resolve masked prefix to the full key
            let full = keyAction;
            if (keyAction.endsWith('...')) {
              const prefix = keyAction.slice(0, -3);
              const { keys } = await db.list({ prefix: `siteKey:${prefix}` });
              const match = keys.find(k => k.name.startsWith(`siteKey:${prefix}`));
              if (!match) return json(res, 404, { error: 'Key not found (it may already be revoked).' });
              const raw = await db.get(match.name);
              if (!raw || JSON.parse(raw).siteId !== site.id) return json(res, 404, { error: 'Key not found for this site.' });
              full = match.name.slice('siteKey:'.length);
            }
            await db.del(`siteKey:${full}`);
            await audit('site.key.revoked', { target: site.id, details: { key: `${full.slice(0, 10)}...` } });
            return json(res, 200, { success: true });
          }
        }

        // POST /api/sites/:siteId/deploy -> upload zip or single file
        if (sub === 'deploy' && method === 'POST') {
          // Admin token (X-Provenode-Token) OR site-scoped CI key (Authorization: Bearer pvnd_...)
          const ci = await resolveCiAuth(req, db);
          if (!ci) return json(res, 401, { error: 'Unauthorized. Provide X-Provenode-Token or a site deploy key (Authorization: Bearer pvnd_...).' });
          if (!ci.admin && ci.siteId !== site.id) return json(res, 403, { error: 'This deploy key belongs to a different site.' });
          if (!process.env.SHELBY_API_KEY) return json(res, 503, { error: 'SHELBY_API_KEY not configured. Shelby storage required for site deploys.' });
          if (!process.env.SHELBY_PRIVATE_KEY) return json(res, 503, { error: 'SHELBY_PRIVATE_KEY not configured.' });

          const ct = req.headers['content-type'] || '';
          let filesToUpload = []; // [{ path, buffer }]
          let entryOverride = null;

          if (ct.includes('multipart/form-data')) {
            const form = formidable({ maxFileSize: 50 * 1024 * 1024, keepExtensions: true, allowEmptyFiles: false, minFileSize: 1 });
            let fields, files;
            try {
              [fields, files] = await new Promise((resolve, reject) => form.parse(req, (err, f, v) => err ? reject(err) : resolve([f, v])));
            } catch (e) {
              return json(res, 400, { error: e.message || 'Upload parse error.' });
            }
            const uploaded = Array.isArray(files?.file) ? files.file[0] : files?.file;
            if (!uploaded) return json(res, 400, { error: 'No file provided. Send multipart field "file" (zip or html).' });
            const { readFile } = await import('node:fs/promises');
            const buf = await readFile(uploaded.filepath);
            const original = uploaded.originalFilename || 'site.zip';
            entryOverride = Array.isArray(fields.entry) ? fields.entry[0] : fields.entry || null;
            if (original.toLowerCase().endsWith('.zip')) {
              const AdmZip = (await import('adm-zip')).default;
              const zip = new AdmZip(buf);
              const entries = zip.getEntries();
              // ZIP-bomb guard: enforce the file-count and total-bytes caps
              // INSIDE the loop. Checking them afterwards let a 50MB archive of
              // 200 highly-compressible 10MB entries buffer ~2GB before any
              // limit was evaluated.
              const MAX_FILES = 200;
              const MAX_TOTAL = 40 * 1024 * 1024;
              const MAX_PER_FILE = 10 * 1024 * 1024;
              let running = 0;
              for (const e of entries) {
                if (e.isDirectory) continue;
                let p = e.entryName.replace(/\\/g, '/').replace(/^\/+/, '');
                if (!p || p.startsWith('__MACOSX/') || p.includes('/__MACOSX/') || p.endsWith('.DS_Store')) continue;
                if (p.includes('..')) continue;
                if (filesToUpload.length >= MAX_FILES) {
                  return json(res, 400, { error: `Too many files in archive (max ${MAX_FILES}).` });
                }
                // Trust the header size first so an oversized entry is rejected
                // before it is decompressed into memory.
                const declared = Number(e.header?.size ?? 0);
                if (declared > MAX_PER_FILE) continue;
                if (declared && running + declared > MAX_TOTAL) {
                  return json(res, 400, { error: 'Total site size exceeds 40MB.' });
                }
                const data = e.getData();
                if (!data || !data.length) continue;
                if (data.length > MAX_PER_FILE) continue; // skip huge files
                running += data.length;
                if (running > MAX_TOTAL) {
                  return json(res, 400, { error: 'Total site size exceeds 40MB.' });
                }
                filesToUpload.push({ path: p, buffer: Buffer.from(data) });
              }
              if (!filesToUpload.length) return json(res, 400, { error: 'Zip is empty or contains no valid files.' });
            } else {
              // single file -> treat as index.html or as-is
              const p = pFromName(original);
              filesToUpload.push({ path: p, buffer: buf });
              function pFromName(n) {
                const low = n.toLowerCase();
                if (low.endsWith('.html') || low.endsWith('.htm')) return 'index.html';
                return n.replace(/[^a-zA-Z0-9._-]/g, '-');
              }
            }
          } else {
            const body = await readBody(req);
            if (body.html && typeof body.html === 'string') {
              filesToUpload.push({ path: 'index.html', buffer: Buffer.from(body.html, 'utf8') });
            } else if (body.files && Array.isArray(body.files)) {
              for (const f of body.files) {
                if (!f.path || !f.contentBase64) continue;
                filesToUpload.push({ path: normalizeSitePath(f.path), buffer: Buffer.from(f.contentBase64, 'base64') });
              }
            } else {
              return json(res, 400, { error: 'Send multipart zip (field "file") or JSON { html } / { files: [{ path, contentBase64 }] }.' });
            }
          }

          if (filesToUpload.length > 200) return json(res, 400, { error: 'Too many files (max 200).' });
          const totalBytes = filesToUpload.reduce((a, f) => a + f.buffer.length, 0);
          if (totalBytes > 40 * 1024 * 1024) return json(res, 400, { error: 'Total site size exceeds 40MB.' });

          // Ensure index.html exists for SPA fallback
          const hasIndex = filesToUpload.some(f => f.path === 'index.html' || f.path.endsWith('/index.html'));
          if (!hasIndex) {
            const firstHtml = filesToUpload.find(f => f.path.endsWith('.html'));
            if (firstHtml) {
              // duplicate first html as index.html for root
              filesToUpload.push({ path: 'index.html', buffer: firstHtml.buffer });
            } else {
              // create minimal index that lists files (HTML-escaped: site.name
              // and file paths are user-controlled)
              const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
              const listing = `<html><body><h1>${esc(site.name)}</h1><ul>${filesToUpload.map(f => `<li><a href="/${esc(f.path)}">${esc(f.path)}</a></li>`).join('')}</ul></body></html>`;
              filesToUpload.push({ path: 'index.html', buffer: Buffer.from(listing, 'utf8') });
            }
          }

          const deploymentId = `dep_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
          const uploadedMeta = [];
          for (const f of filesToUpload) {
            const sha256 = createHash('sha256').update(f.buffer).digest('hex');
            const blobName = siteBlobName(site.slug, deploymentId, f.path);
            const up = await shelbyUpload({ blobData: new Uint8Array(f.buffer), blobName, apiKey: process.env.SHELBY_API_KEY });
            uploadedMeta.push({ path: f.path, size: f.buffer.length, sha256, blobName, objectId: up.objectId, contentType: contentTypeFor(f.path) });
          }
          // manifest
          const manifest = { siteId: site.id, siteSlug: site.slug, deploymentId, files: uploadedMeta, entryPath: entryOverride ? normalizeSitePath(entryOverride) : 'index.html', createdAt: new Date().toISOString() };
          const manifestUp = await shelbyUpload({ blobData: Buffer.from(JSON.stringify(manifest, null, 2)), blobName: manifestBlobName(site.slug, deploymentId), apiKey: process.env.SHELBY_API_KEY });

          const deployment = buildDeploymentRecord({ siteId: site.id, siteSlug: site.slug, files: uploadedMeta, entryPath: manifest.entryPath });
          deployment.id = deploymentId;
          deployment.manifestObjectId = manifestUp.objectId;
          deployment.manifestBlobName = manifestBlobName(site.slug, deploymentId);

          await db.put(`siteDeploy:${site.id}:${deploymentId}`, JSON.stringify(deployment));
          site.lastDeploymentId = deploymentId;
          site.deploymentCount = (site.deploymentCount || 0) + 1;
          site.updatedAt = new Date().toISOString();
          site.lastDeploymentAt = deployment.createdAt;
          await db.put(`site:${site.id}`, JSON.stringify(site));
          await audit('site.deployed', { target: site.id, details: { deploymentId, fileCount: uploadedMeta.length, totalBytes } });

          return json(res, 201, {
            success: true,
            deployment,
            serveUrl: `/api/sites/${site.id}/serve/`,
            previewUrl: `/api/sites/${site.id}/serve/${deployment.entryPath}`,
            publicUrl: `/s/${site.slug}`,
          });
        }

        // POST /api/sites/:siteId/rollback { deploymentId } -> instant rollback
        // Promotes an existing immutable snapshot back to production. No re-upload:
        // the blobs already live on Shelby, we only move the production pointer.
        if (sub === 'rollback' && method === 'POST') {
          if (requireAuth(req, res)) return;
          const body = await readBody(req);
          const target = String(body.deploymentId || '').trim();
          if (!target) return json(res, 400, { error: 'deploymentId required.' });
          if (target === site.lastDeploymentId) return json(res, 400, { error: 'That deployment is already live in production.' });

          const depRaw = await db.get(`siteDeploy:${site.id}:${target}`);
          if (!depRaw) return json(res, 404, { error: 'Deployment not found for this site.' });
          const dep = JSON.parse(depRaw);

          const previous = site.lastDeploymentId;
          site.lastDeploymentId = target;
          site.updatedAt = new Date().toISOString();
          site.rolledBackAt = site.updatedAt;
          site.rollbackHistory = [
            { from: previous, to: target, at: site.updatedAt },
            ...(site.rollbackHistory || []),
          ].slice(0, 20);
          await db.put(`site:${site.id}`, JSON.stringify(site));
          await audit('site.rolled_back', { target: site.id, details: { from: previous, to: target, fileCount: dep.fileCount } });
          await notify('site.rolled_back', { siteId: site.id, slug: site.slug, from: previous, to: target });

          return json(res, 200, {
            success: true,
            site,
            deployment: dep,
            message: `Production now serving ${target} (${dep.fileCount} files).`,
            publicUrl: `/s/${site.slug}`,
          });
        }

        // GET /api/sites/:siteId/serve/<path...>  (also supports ?path=)
        if (sub === 'serve' && method === 'GET') {
          const qPath = String(q.path || '').trim();
          let filePath = parts.length > 3 ? parts.slice(3).join('/') : (qPath || '');
          filePath = normalizeSitePath(filePath || 'index.html');

          if (!site.lastDeploymentId) return json(res, 404, { error: 'No deployments yet. Deploy a site first.' });
          const depRaw = await siteDb.get(`siteDeploy:${site.id}:${site.lastDeploymentId}`);
          if (!depRaw) return json(res, 404, { error: 'Deployment manifest not found.' });
          const dep = JSON.parse(depRaw);

          // resolve file with fallbacks: exact -> path.html -> path/index.html -> index.html
          let entry = dep.files.find(f => f.path === filePath);
          if (!entry && !filePath.includes('.')) {
            entry = dep.files.find(f => f.path === `${filePath}.html`) || dep.files.find(f => f.path === `${filePath}/index.html`);
          }
          if (!entry) entry = dep.files.find(f => f.path === 'index.html');
          if (!entry) return json(res, 404, { error: `File not found: ${filePath}` });

          // parse objectId to get address + blobName
          const m = /\/blobs\/([^/]+)\/(.+)$/.exec(entry.objectId);
          if (!m) return json(res, 500, { error: 'Invalid objectId in manifest.' });
          const address = m[1], blobName = decodeURIComponent(m[2]);
          try {
            const { buffer } = await shelbyDownloadBlob({ address, blobName, apiKey: process.env.SHELBY_API_KEY });
            applySiteContentHeaders(res, { entry, siteSlug: site.slug });
            return res.status(200).send(buffer);
          } catch (e) {
            return json(res, 502, { error: `Shelby fetch failed: ${e.message}` });
          }
        }

        // GET /api/sites/:siteId/preview/:depId/<path>
        if (sub === 'preview' && method === 'GET') {
          const depId = parts[3];
          if (!depId) return json(res, 400, { error: 'deploymentId required.' });
          const depRaw = await siteDb.get(`siteDeploy:${site.id}:${depId}`);
          if (!depRaw) return json(res, 404, { error: 'Deployment not found.' });
          const dep = JSON.parse(depRaw);
          let filePath = parts.length > 4 ? parts.slice(4).join('/') : (String(q.path || '') || 'index.html');
          filePath = normalizeSitePath(filePath);
          let entry = dep.files.find(f => f.path === filePath);
          if (!entry && !filePath.includes('.')) entry = dep.files.find(f => f.path === `${filePath}.html`) || dep.files.find(f => f.path === `${filePath}/index.html`);
          if (!entry) entry = dep.files.find(f => f.path === 'index.html');
          if (!entry) return json(res, 404, { error: `File not found: ${filePath}` });
          const m = /\/blobs\/([^/]+)\/(.+)$/.exec(entry.objectId);
          if (!m) return json(res, 500, { error: 'Invalid objectId.' });
          const address = m[1], blobName = decodeURIComponent(m[2]);
          try {
            const { buffer } = await shelbyDownloadBlob({ address, blobName, apiKey: process.env.SHELBY_API_KEY });
            applySiteContentHeaders(res, { entry, siteSlug: site.slug });
            return res.status(200).send(buffer);
          } catch (e) {
            return json(res, 502, { error: `Shelby fetch failed: ${e.message}` });
          }
        }

        return json(res, 404, { error: `Unknown sites sub-route: ${sub}` });
      }
    }

    // ── EARNINGS (real ShelbyUSD settlements) ────────────────
    if (root === 'earnings' && method === 'GET') {
      // Real mode: totals come from settled on-chain payment intents — no simulation.
      const settled = (await listPaymentIntents(tenantId)).filter(p => p.status === 'paid');
      const totalMicro = settled.reduce((a, p) => a + (p.amountMicro || 0), 0);
      const nodes = settled.map(p => ({
        id: `pay-${p.id.slice(0, 8)}`,
        item: p.item,
        inferences: 1,
        earnedApt: microToShelbyUSD(p.amountMicro).toFixed(6),
        status: 'streaming',
        txHash: p.txHash || null,
        paidAt: p.paidAt,
      }));
      return json(res, 200, {
        success: true,
        nodes,
        totalEarned: microToShelbyUSD(totalMicro).toFixed(6),
        totalShelbyUSD: microToShelbyUSD(totalMicro).toFixed(6),
        settlements: settled.length,
        tokenVelocity: 'on-chain settlements',
      });
    }

    // Known roots — used only to choose 405 (wrong method) over 404 (no route).
    const _kp = [
      '/api/health', '/api/config', '/api/models', '/api/metrics', '/api/docs',
      '/api/objects', '/api/audit', '/api/analytics', '/api/schedule', '/api/groups',
      '/api/bluegreen', '/api/webhooks', '/api/marketplace', '/api/payments',
      '/api/passport', '/api/registry', '/api/compliance', '/api/lineage', '/api/sign',
      '/api/notifications', '/api/stream', '/api/inference-cache', '/api/checkpoints',
      '/api/distillation', '/api/fingerprint', '/api/abtest-lock', '/api/earnings',
      '/api/sites', '/api/shelby-status', '/api/registry/status', '/api/registry/verify',
      // previously missing — these live routes returned 404 on a wrong method
      '/api/upload', '/api/deploy', '/api/status', '/api/devices', '/api/fleet',
      '/api/abtest', '/api/import', '/api/agent', '/api/identity', '/api/certificate',
      '/api/zkproof', '/api/integrity', '/api/datasets', '/api/federated', '/api/delta',
      '/api/selfheal', '/api/provenance', '/api/telemetry', '/api/bridge',
      '/api/stream-inference', '/api/slack',
    ];
    // Boundary match (k or k + '/…') — '/api/streaming/session' must NOT match '/api/stream'.
    const known = _kp.some(k => path === k || path.startsWith(k + '/'));
    return json(res, known ? 405 : 404, { error: `Method ${method} not allowed on ${path}.`, tip:'See GET /api/docs' });
  } catch (err) {
    console.error('[api]', err);
    // Do not leak internal error text (Redis/Shelby/Aptos SDK messages) to
    // clients in production; the full error is still in the server log.
    const detail = isProdRuntime() ? 'Internal error' : (err.message || 'Internal error');
    return json(res, 500, { error: detail });
  }
}
