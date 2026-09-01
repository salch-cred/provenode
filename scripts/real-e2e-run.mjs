#!/usr/bin/env node
/**
 * ONE real end-to-end run: model file → Shelby blob → SHA-256 → on-chain anchor.
 *
 * This replaces the placeholder `0xaabbccdd…` first-registration with a genuine
 * digest and makes the contract's `model_count` reflect real work.
 *
 * SAFETY MODEL:
 *   1. DRY RUN IS THE DEFAULT. Without `--apply` the script verifies every
 *      precondition (credentials, chain reachability, registry ownership,
 *      current model_count) and computes the real SHA-256 locally, then STOPS
 *      before any upload or transaction. Nothing is spent.
 *   2. `--apply` performs exactly one upload and at most one on-chain tx, and
 *      prints the resulting blob URL, digest, tx hash, and explorer link.
 *   3. `--apply` additionally requires `--yes`.
 *
 * Usage:
 *   node scripts/real-e2e-run.mjs --file ./model.onnx --name "ResNet-v2"
 *   node scripts/real-e2e-run.mjs --file ./model.onnx --name "ResNet-v2" --apply --yes
 *
 * Env required for --apply:
 *   SHELBY_API_KEY, SHELBY_PRIVATE_KEY   (upload + signing)
 *   KV_REST_API_URL, KV_REST_API_TOKEN   (persist the model record)
 *   MOVE_CONTRACT_ADDRESS                (optional; defaults to the deployed registry)
 */
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { getDB } from '../lib/kv.js';
import { MODEL_REGISTRY_ADDRESS, SHELBY_RPC, getModelCount, accountExplorerUrl, txExplorerUrl } from '../lib/registry.js';

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const valOf = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };

const FILE = valOf('--file');
const NAME = valOf('--name') || (FILE ? basename(FILE) : null);
const VERSION = valOf('--version') || '1.0.0';
const APPLY = has('--apply');
const CONFIRMED = has('--yes');

function die(msg) { console.error(`FATAL: ${msg}`); process.exit(1); }
const ok = (m) => console.log(`  [ok]   ${m}`);
const bad = (m) => console.log(`  [FAIL] ${m}`);
const info = (m) => console.log(`  [info] ${m}`);

if (!FILE) die('--file <path> is required (a real model file — do NOT use a fixture).');

console.log('='.repeat(78));
console.log(`Provenode real end-to-end run — ${APPLY ? 'APPLY (spends storage + gas)' : 'DRY RUN (no writes)'}`);
console.log('='.repeat(78));

/* ── 1. The file ──────────────────────────────────────────────────────────── */
console.log('\n1. Model file');
let buf, size;
try { buf = readFileSync(FILE); size = statSync(FILE).size; }
catch (e) { die(`cannot read ${FILE}: ${e.message}`); }

if (size < 1024) {
  bad(`${FILE} is ${size} bytes — that is a fixture, not a model.`);
  die('Refusing: this run exists to put REAL data on-chain. Use a genuine model file.');
}
const sha256 = createHash('sha256').update(buf).digest('hex');
ok(`${FILE} — ${(size / 1024).toFixed(1)} KB`);
ok(`SHA-256 = ${sha256}`);
info(`name="${NAME}" version="${VERSION}"`);

if (/^(aabbccdd)+$/i.test(sha256)) die('computed digest is the placeholder — impossible, aborting.');

/* ── 2. Credentials ───────────────────────────────────────────────────────── */
console.log('\n2. Credentials');
const need = {
  SHELBY_API_KEY: process.env.SHELBY_API_KEY,
  SHELBY_PRIVATE_KEY: process.env.SHELBY_PRIVATE_KEY,
  KV_REST_API_URL: process.env.KV_REST_API_URL,
  KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN,
};
let missing = [];
for (const [k, v] of Object.entries(need)) {
  if (v) ok(`${k} present`); else { bad(`${k} MISSING`); missing.push(k); }
}
info(`MOVE_CONTRACT_ADDRESS = ${MODEL_REGISTRY_ADDRESS}`);

/* ── 3. Chain reachability + current state ────────────────────────────────── */
console.log('\n3. Chain');
try {
  const chain = await (await fetch(SHELBY_RPC)).json();
  ok(`Shelbynet reachable — chain_id=${chain.chain_id} ledger=${chain.ledger_version}`);
  if (String(chain.chain_id) !== '118') bad(`expected chain_id 118, got ${chain.chain_id}`);
} catch (e) { bad(`RPC unreachable: ${e.message}`); missing.push('CHAIN'); }

let beforeCount = null;
try { beforeCount = await getModelCount(); ok(`registry model_count (before) = ${beforeCount}`); }
catch (e) { bad(`model_count read failed: ${e.message}`); }

/* ── 4. Registry ownership ────────────────────────────────────────────────── */
console.log('\n4. Registry ownership');
if (need.SHELBY_PRIVATE_KEY) {
  try {
    const { Account, Ed25519PrivateKey } = await import('@aptos-labs/ts-sdk');
    const acct = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(need.SHELBY_PRIVATE_KEY) });
    const signer = acct.accountAddress.toString();
    ok(`signer = ${signer}`);
    if (signer.toLowerCase() === MODEL_REGISTRY_ADDRESS.toLowerCase()) {
      ok('signer IS the registry owner — register_model will be accepted');
    } else {
      bad(`signer is NOT the registry owner (${MODEL_REGISTRY_ADDRESS})`);
      info('register_model requires the owner signer; the anchor step will fail.');
      missing.push('OWNERSHIP');
    }
    info(`account explorer: ${accountExplorerUrl(signer)}`);
  } catch (e) { bad(`key parse failed: ${e.message}`); missing.push('KEY'); }
} else {
  info('skipped — SHELBY_PRIVATE_KEY not set');
}

/* ── 5. Stop here unless applying ─────────────────────────────────────────── */
console.log('\n' + '='.repeat(78));
if (!APPLY) {
  console.log('DRY RUN complete — nothing was uploaded, written, or signed.');
  if (missing.length) {
    console.log(`\nBlockers before --apply can succeed: ${[...new Set(missing)].join(', ')}`);
  } else {
    console.log('\nAll preconditions satisfied. To perform the real run:');
    console.log(`  node scripts/real-e2e-run.mjs --file ${FILE} --name "${NAME}" --apply --yes`);
  }
  process.exit(missing.length ? 2 : 0);
}
if (!CONFIRMED) die('--apply requires --yes.');
if (missing.length) die(`cannot apply — unresolved blockers: ${[...new Set(missing)].join(', ')}`);

/* ── 6. Real upload ───────────────────────────────────────────────────────── */
console.log('\n6. Uploading to Shelby (real blob, 90-day expiry)');
const { shelbyUpload } = await import('../lib/shelby.js');
const safeName = String(NAME).replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase();
const blobName = `models/${safeName}/${VERSION}/${sha256.slice(0, 16)}`;
const up = await shelbyUpload({ blobData: buf, blobName, apiKey: need.SHELBY_API_KEY });
ok(`objectId  = ${up.objectId}`);
ok(`blobName  = ${blobName}`);
if (up.downloadUrl) ok(`downloadUrl = ${up.downloadUrl}`);

/* ── 7. Persist the record ────────────────────────────────────────────────── */
console.log('\n7. Persisting model record');
const db = getDB(valOf('--tenant') || '');
const id = `model_${sha256.slice(0, 12)}`;
const record = {
  id, model: NAME, name: NAME, version: VERSION,
  sha256, size, mode: 'shelby',
  objectId: up.objectId, blobName,
  address: up.address ?? null,
  expiresAt: up.expiresAt ?? null,
  createdAt: new Date().toISOString(),
  tags: ['real', 'e2e'],
};
await db.put(`model:${id}`, JSON.stringify(record));
ok(`stored model:${id}`);

/* ── 8. Anchor on-chain ───────────────────────────────────────────────────── */
console.log('\n8. Anchoring on-chain (ModelRegistry::register_model)');
const { anchorOnChain } = await import('../lib/passport.js');
let anchor = null;
try {
  anchor = await anchorOnChain({ modelName: NAME, sha256, orgAddress: record.address ?? MODEL_REGISTRY_ADDRESS });
  ok(`txHash = ${anchor.txHash}`);
  ok(`explorer = ${anchor.explorerUrl ?? txExplorerUrl(anchor.txHash)}`);
  record.onChainTx = anchor.txHash;
  record.onChainExplorerUrl = anchor.explorerUrl ?? txExplorerUrl(anchor.txHash);
  record.onChainAnchor = 'move-tx';
  await db.put(`model:${id}`, JSON.stringify(record));
} catch (e) {
  bad(`anchor failed: ${e.message}`);
  info('The blob and record are persisted; re-run the anchor once the cause is fixed.');
}

/* ── 9. Verify the new state ──────────────────────────────────────────────── */
console.log('\n9. Verification');
try {
  const afterCount = await getModelCount();
  ok(`registry model_count: ${beforeCount} -> ${afterCount}`);
} catch (e) { bad(`model_count re-read failed: ${e.message}`); }

console.log('\n' + '='.repeat(78));
console.log('Real end-to-end run complete.');
console.log(`  digest   ${sha256}`);
console.log(`  objectId ${up.objectId}`);
if (anchor) console.log(`  tx       ${anchor.txHash}`);
console.log('\nUpdate ONCHAIN.md with these values to replace the placeholder row.');
