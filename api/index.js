/**
 * Provenode mega-router — single serverless function for all /api/* routes
 * Hobby plan limit: max 12 functions. This + 2 crons = 3 total.
 */
import { createHash, createHmac } from 'node:crypto';
import formidable from 'formidable';
import { getDB } from './lib/kv.js';
import { shelbyUpload, makeBlobName } from './lib/shelby.js';
import { dispatch } from './lib/notify.js';
import { logAudit, getAuditLog } from './lib/audit.js';
import { signModel } from './lib/sign.js';
import { sendEmail, deploymentVerifiedEmail, integrityMismatchEmail, expiryWarningEmail } from './lib/email.js';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Provenode-Token');
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

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const path = pathOf(req);
  const q = queryOf(req);
  const method = req.method || 'GET';
  const db = getDB();

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
        mode: process.env.SHELBY_API_KEY ? 'shelby' : 'demo',
        network: process.env.SHELBY_NETWORK || 'shelbynet',
        shelbyApiUrl: 'https://api.shelbynet.shelby.xyz/v1',
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
        mode: hasKey ? 'production' : 'demo',
        network: process.env.SHELBY_NETWORK || 'shelbynet',
        connected: hasKey,
        persistentIdentity: Boolean(process.env.SHELBY_PRIVATE_KEY),
        apiUrl: 'https://api.shelbynet.shelby.xyz/v1',
      });
    }

    // ── identity ────────────────────────────────────────────
    if (root === 'identity') {
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
          explorerUrl: `https://explorer.aptoslabs.com/account/${account.accountAddress.toString()}?network=custom&customNetworkUrl=https://api.shelbynet.shelby.xyz/v1`,
        });
      }
      if (method === 'POST') {
        const privKey = process.env.SHELBY_PRIVATE_KEY;
        const apiKey = process.env.SHELBY_API_KEY;
        if (!privKey || !apiKey) return json(res, 400, { error: 'SHELBY_PRIVATE_KEY and SHELBY_API_KEY required.' });
        const { Account, Ed25519PrivateKey, Network } = await import('@aptos-labs/ts-sdk');
        const { ShelbyClient } = await import('@shelby-protocol/sdk/browser');
        const account = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(privKey) });
        const client = new ShelbyClient({ network: Network.SHELBYNET, apiKey });
        await client.fundAccountWithAPT({ address: account.accountAddress, amount: 100_00000000 });
        await client.fundAccountWithShelbyUSD({ address: account.accountAddress, amount: 10000_00000000 });
        return json(res, 200, { success: true, address: account.accountAddress.toString(), funded: true });
      }
    }

    // ── models ──────────────────────────────────────────────
    if (root === 'models' && method === 'GET') {
      const PUBLIC = ['id','model','objectId','sha256','size','mode','address','expiresAt','parentId','tags','createdAt','signature'];
      const { keys } = await db.list({ prefix: 'model:' });
      const models = (await Promise.all(keys.map(async ({ name }) => {
        const d = await db.get(name); if (!d) return null;
        const r = JSON.parse(d);
        return Object.fromEntries(PUBLIC.map(f => [f, r[f]]).filter(([,v]) => v !== undefined));
      }))).filter(Boolean).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
      return json(res, 200, { success: true, models });
    }

    // ── upload ──────────────────────────────────────────────
    if (root === 'upload' && method === 'POST') {
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
      const { objectId, mode, warning, address, expiresAt } = await shelbyUpload({
        blobData: new Uint8Array(bytes), blobName, apiKey: process.env.SHELBY_API_KEY,
      });
      const sig = await signModel(sha256);
      const record = {
        id, model: modelName, objectId, sha256, size: bytes.length, mode, address, expiresAt,
        parentId: parentId || null,
        tags: tags ? String(tags).split(',').map(t => t.trim()) : [],
        signature: sig || null,
        createdAt: new Date().toISOString(),
      };
      await db.put(`model:${id}`, JSON.stringify(record));
      if (parentId) await db.put(`lineage:${id}`, JSON.stringify({ parentId, childId: id }));
      await logAudit('model.registered', { target: id, details: { model: modelName, mode } });
      await dispatch('model.registered', { id, model: modelName, mode, sha256: sha256.slice(0, 12) });
      return json(res, 200, { success: true, id, objectId, hash: sha256, size: bytes.length, mode, expiresAt, ...(warning && { warning }) });
    }

    // ── deploy ──────────────────────────────────────────────
    if (root === 'deploy' && method === 'POST') {
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
      let sha256 = model?.sha256, shelbyObjectId = model?.objectId, deployMode = model?.mode || 'demo', warning;
      if (!sha256) {
        const seed = resolvedName + resolvedVersion + Date.now();
        sha256 = createHash('sha256').update(String(seed)).digest('hex');
        const blobName = makeBlobName(resolvedName, `-manifest-${Date.now()}`);
        const r = await shelbyUpload({ blobData: new TextEncoder().encode(seed), blobName, apiKey: process.env.SHELBY_API_KEY });
        shelbyObjectId = r.objectId; deployMode = r.mode; warning = r.warning;
      }
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
      await logAudit('deployment.started', { target: id, details: { model: resolvedName } });
      await dispatch('deployment.started', { id, model: resolvedName, version: resolvedVersion, mode: deployMode });
      return json(res, 200, { success: true, manifest, ...(warning && { warning }) });
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
        if (manifest.progress >= 100 && manifest.status !== 'verified') {
          manifest.status = 'verified';
          await db.put(`deployment:${id}`, JSON.stringify(manifest));
          await dispatch('deployment.verified', { id, model: manifest.model });
          if (process.env.ALERT_EMAIL) {
            await sendEmail({ to: process.env.ALERT_EMAIL, ...deploymentVerifiedEmail(manifest) });
          }
        }
        return json(res, 200, { success: true, manifest, devices });
      }
      if (method === 'POST') {
        const body = await readBody(req);
        const token = req.headers['x-provenode-token'];
        if (process.env.DEPLOY_SECRET && token !== process.env.DEPLOY_SECRET) {
          return json(res, 401, { error: 'Unauthorized. Set X-Provenode-Token header.' });
        }
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
    if (root === 'objects' && method === 'GET') {
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
          await dispatch('integrity.mismatch', { deviceId, deploymentId, error });
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
        await dispatch('canary.advanced', { id, stage: stages[manifest.canary.currentStage] });
        return json(res, 200, { success: true, manifest });
      }
      if (method === 'POST' && parts[1] === 'canary' && parts[3] === 'rollback') {
        const id = parts[2];
        const raw = await db.get(`deployment:${id}`);
        if (!raw) return json(res, 404, { error: 'Not found.' });
        const manifest = JSON.parse(raw);
        manifest.status = 'rolled_back'; manifest.rolledBackAt = new Date().toISOString();
        await db.put(`deployment:${id}`, JSON.stringify(manifest));
        await dispatch('deployment.rolled_back', { id, model: manifest.model });
        return json(res, 200, { success: true, manifest });
      }
      return json(res, 404, { error: 'Unknown fleet endpoint.' });
    }

    // ── abtest ──────────────────────────────────────────────
    if (root === 'abtest') {
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
          await dispatch('test', { message: 'Provenode webhook test' });
          return json(res, 200, { success: true });
        }
        const { url, events, secret, name } = body;
        if (!url) return json(res, 400, { error: 'url required.' });
        let _pu; try { _pu = new URL(url); } catch { return json(res, 400, { error: 'Invalid URL.' }); }
        const _blk=['localhost','127.','0.0.0.0','::1','169.254.','10.0.','192.168.','172.16.'];
        if(_blk.some(b=>_pu.hostname===b||_pu.hostname.startsWith(b))||!['http:','https:'].includes(_pu.protocol)){return json(res,400,{error:'Private or non-HTTP URLs are not allowed.'});}
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
          const newId = crypto.randomUUID();
          const record = { id: newId, model: listing.name, objectId: listing.shelbyObjectId, sha256: listing.sha256, size: listing.size, mode: listing.mode, source: `marketplace:${body.listingId}`, tags: ['marketplace', ...(listing.tags || [])], createdAt: new Date().toISOString() };
          await db.put(`model:${newId}`, JSON.stringify(record));
          listing.downloads = (listing.downloads || 0) + 1;
          await db.put(`marketplace:${body.listingId}`, JSON.stringify(listing));
          return json(res, 200, { success: true, modelId: newId, record });
        }
        const { modelId, description, tags, license } = body;
        if (!modelId) return json(res, 400, { error: 'modelId required.' });
        const mRaw = await db.get(`model:${modelId}`);
        if (!mRaw) return json(res, 404, { error: 'Model not found.' });
        const model = JSON.parse(mRaw);
        const id = crypto.randomUUID();
        const listing = { id, modelId, name: model.model, description: description || '', sha256: model.sha256, shelbyObjectId: model.objectId, size: model.size, mode: model.mode, tags: tags || model.tags || [], license: license || 'Apache-2.0', downloads: 0, publishedAt: new Date().toISOString() };
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

    // ── analytics ───────────────────────────────────────────
    if (root === 'analytics') {
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
        const since = Date.now() - parseInt(days) * 86400000;
        const { keys } = await db.list({ prefix: `analytics:${deviceId}:${metric}:` });
        const points = (await Promise.all(keys.map(async ({ name }) => {
          const ts = parseInt(name.split(':').pop());
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
        for (const { name } of keys) {
          if (name.endsWith(id)) { await db.del(name); break; }
        }
        return json(res, 200, { success: true });
      }
    }

    // ── groups ──────────────────────────────────────────────
    if (root === 'groups') {
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
      const records = await getAuditLog({ action: q.action, from: q.from, to: q.to, limit: parseInt(q.limit || '100') });
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
          const lines = ['id,model,sha256,mode,objectId,createdAt', ...models.map(m => `${m.id},${m.model},${m.sha256},${m.mode},${m.objectId},${m.createdAt}`)];
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', `attachment; filename="provenode-compliance.csv"`);
          return res.status(200).send(lines.join('\n'));
        }
        return json(res, 200, { success: true, report });
      }
    }

    // ── sign ────────────────────────────────────────────────
    if (root === 'sign') {
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
        },
      });
    }

    // ── notifications ───────────────────────────────────────
    if (root === 'notifications') {
      if (method === 'GET') {
        const to = process.env.ALERT_EMAIL;
        if (!to) return json(res, 400, { error: 'ALERT_EMAIL not set.' });
        const result = await sendEmail({ to, subject: '✅ Provenode email test', html: '<p>Email works.</p>' });
        return json(res, 200, { success: true, result });
      }
      if (method === 'POST') {
        const body = await readBody(req);
        const to = body.to || process.env.ALERT_EMAIL;
        if (!to) return json(res, 400, { error: 'to or ALERT_EMAIL required.' });
        let emailData = { subject: 'Provenode', html: '<p>Notification</p>' };
        if (body.type === 'deployment_verified') emailData = deploymentVerifiedEmail(body.deployment || {});
        if (body.type === 'integrity_mismatch') emailData = integrityMismatchEmail(body);
        if (body.type === 'expiry_warning') emailData = expiryWarningEmail(body.objects || []);
        const result = await sendEmail({ to, ...emailData });
        return json(res, 200, { success: result.ok, result });
      }
    }

    // ── slack (basic) ───────────────────────────────────────
    if (root === 'slack' && method === 'POST') {
      return json(res, 200, {
        response_type: 'ephemeral',
        text: 'Provenode bot online. Commands: status | fleet | rollback <id>',
      });
    }

    const _kp=['/api/health','/api/config','/api/models','/api/metrics','/api/docs','/api/objects','/api/audit','/api/analytics','/api/schedule','/api/groups','/api/bluegreen','/api/webhooks','/api/marketplace','/api/compliance','/api/lineage','/api/sign','/api/notifications','/api/stream'];
    return json(res, _kp.some(k=>path.startsWith(k)) ? 405 : 404, { error: `Method ${method} not allowed on ${path}.`, tip:'See GET /api/docs' });
  } catch (err) {
    console.error('[api]', err);
    return json(res, 500, { error: err.message || 'Internal error' });
  }
}
