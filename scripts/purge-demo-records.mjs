#!/usr/bin/env node
/**
 * Purge placeholder / fuzz records from a Provenode KV namespace.
 *
 * SAFETY MODEL — read this before running:
 *   1. DRY RUN IS THE DEFAULT. Without `--apply` nothing is deleted; the script
 *      only prints, in full, every key it would remove and why.
 *   2. `--apply` writes a timestamped JSON backup of every record to
 *      ./purge-backup-<ts>.json BEFORE the first delete. Restore with
 *      `--restore <file>`.
 *   3. It refuses to run against a namespace it cannot read, and refuses
 *      `--apply` unless `--yes` is also passed.
 *
 * Usage:
 *   node scripts/purge-demo-records.mjs                      # dry run, all tenants
 *   node scripts/purge-demo-records.mjs --tenant did:privy:x  # dry run, one tenant
 *   node scripts/purge-demo-records.mjs --apply --yes         # DESTRUCTIVE
 *   node scripts/purge-demo-records.mjs --restore purge-backup-….json
 *
 * Env required: KV_REST_API_URL, KV_REST_API_TOKEN
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { getDB } from '../lib/kv.js';

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const valOf = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };

const APPLY = has('--apply');
const CONFIRMED = has('--yes');
const TENANT = valOf('--tenant') || '';
const RESTORE = valOf('--restore');

if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
  console.error('FATAL: KV_REST_API_URL and KV_REST_API_TOKEN must be set.');
  console.error('Without them getDB() silently uses an in-memory store and this script would be a no-op.');
  process.exit(1);
}

const db = getDB(TENANT);

/* ── Detection rules ─────────────────────────────────────────────────────────
 * Every rule states WHY a record is placeholder data. Nothing is deleted for
 * being merely old or empty.
 * ------------------------------------------------------------------------- */

const PLACEHOLDER_SHA = /^(0x)?(aabbccdd)+$/i;
const REPEATED_CHAR   = /^(.)\1{15,}$/;              // AAAA… fuzz strings
const DEMO_OBJECT     = /^demo:\/\//i;

function classifyModel(rec) {
  const reasons = [];
  if (DEMO_OBJECT.test(rec.objectId || '')) reasons.push(`objectId is demo:// (${rec.objectId})`);
  if (PLACEHOLDER_SHA.test((rec.sha256 || '').replace(/^0x/, ''))) reasons.push(`sha256 is the aabbccdd placeholder`);
  if (rec.mode && rec.mode !== 'shelby' && rec.mode !== 'real') reasons.push(`mode="${rec.mode}" (not a real Shelby blob)`);
  if (REPEATED_CHAR.test(rec.model || '')) reasons.push(`model name is a fuzz string ("${String(rec.model).slice(0, 20)}…")`);
  if (rec.objectId && !DEMO_OBJECT.test(rec.objectId) && !/\/blobs\//.test(rec.objectId)) {
    reasons.push(`objectId is not a Shelby blob URL (${String(rec.objectId).slice(0, 40)})`);
  }
  return reasons;
}

function classifyListing(rec) {
  const reasons = [];
  for (const field of ['name', 'description']) {
    const v = rec[field];
    if (typeof v === 'string' && REPEATED_CHAR.test(v.trim())) {
      reasons.push(`${field} is a fuzz string (${v.trim().slice(0, 12)}… len=${v.length})`);
    }
    if (typeof v === 'string' && v.length > 4000) {
      reasons.push(`${field} is implausibly long (len=${v.length}) — fuzz payload`);
    }
  }
  if (DEMO_OBJECT.test(rec.shelbyObjectId || '')) reasons.push(`shelbyObjectId is demo:// (${rec.shelbyObjectId})`);
  if (PLACEHOLDER_SHA.test((rec.sha256 || '').replace(/^0x/, ''))) reasons.push('sha256 is the aabbccdd placeholder');
  return reasons;
}

function classifyDeployment(rec) {
  const reasons = [];
  if (DEMO_OBJECT.test(rec.objectId || '')) reasons.push(`objectId is demo:// (${rec.objectId})`);
  if (rec.mode && rec.mode === 'demo') reasons.push('mode="demo"');
  return reasons;
}

const SCANS = [
  { prefix: 'model:',       label: 'model',      classify: classifyModel },
  { prefix: 'marketplace:', label: 'listing',    classify: classifyListing },
  { prefix: 'deployment:',  label: 'deployment', classify: classifyDeployment },
];

/* ── Restore mode ─────────────────────────────────────────────────────────── */
if (RESTORE) {
  const backup = JSON.parse(readFileSync(RESTORE, 'utf8'));
  console.log(`Restoring ${backup.records.length} record(s) from ${RESTORE} (tenant="${backup.tenant}")`);
  const rdb = getDB(backup.tenant || '');
  for (const r of backup.records) {
    await rdb.put(r.key, r.raw);
    console.log(`  restored ${r.key}`);
  }
  console.log('Restore complete.');
  process.exit(0);
}

/* ── Scan ─────────────────────────────────────────────────────────────────── */
console.log('='.repeat(78));
console.log(`Provenode placeholder purge — ${APPLY ? 'APPLY (DESTRUCTIVE)' : 'DRY RUN (no writes)'}`);
console.log(`KV: ${process.env.KV_REST_API_URL.replace(/\/\/.*@/, '//***@')}`);
console.log(`Tenant prefix: ${TENANT ? `"${TENANT}"` : '(global / unprefixed)'}`);
console.log('='.repeat(78));

const doomed = [];
let scanned = 0;

for (const scan of SCANS) {
  const { keys } = await db.list({ prefix: scan.prefix });
  console.log(`\n${scan.label}: scanned ${keys.length} key(s) under "${scan.prefix}"`);
  for (const { name } of keys) {
    const raw = await db.get(name);
    if (!raw) continue;
    scanned++;
    let rec;
    try { rec = JSON.parse(raw); } catch { continue; }
    const reasons = scan.classify(rec);
    if (reasons.length) {
      doomed.push({ key: name, kind: scan.label, id: rec.id, raw, reasons });
      console.log(`  DELETE ${name}`);
      console.log(`         id=${rec.id ?? '(none)'} name=${JSON.stringify(String(rec.model ?? rec.name ?? '').slice(0, 40))}`);
      for (const r of reasons) console.log(`         · ${r}`);
    }
  }
}

console.log('\n' + '='.repeat(78));
console.log(`Scanned ${scanned} record(s). Matched ${doomed.length} for deletion.`);

if (!doomed.length) { console.log('Nothing to do.'); process.exit(0); }

if (!APPLY) {
  console.log('\nDRY RUN — nothing was deleted.');
  console.log('Re-run with:  --apply --yes    (a JSON backup is written first)');
  process.exit(0);
}

if (!CONFIRMED) {
  console.error('\nREFUSING: --apply requires --yes as an explicit confirmation.');
  process.exit(1);
}

/* ── Backup, then delete ──────────────────────────────────────────────────── */
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = `purge-backup-${stamp}.json`;
writeFileSync(backupFile, JSON.stringify({ tenant: TENANT, createdAt: new Date().toISOString(), records: doomed }, null, 2));
console.log(`\nBackup written: ${backupFile}`);

for (const d of doomed) {
  await db.del(d.key);
  console.log(`  deleted ${d.key}`);
}

console.log(`\nDone. Deleted ${doomed.length} record(s).`);
console.log(`Restore with:  node scripts/purge-demo-records.mjs --restore ${backupFile}`);
