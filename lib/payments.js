/**
 * Real ShelbyUSD micropayments for Provenode.
 *
 * Payments settle on-chain through Shelby's micropayment channels
 * (ShelbyMicropaymentChannelClient). This module owns the business logic:
 * fixed price table, intent lifecycle, and receipt hashing. The on-chain
 * settle step (receiverWithdraw) lives in the API route.
 *
 * ShelbyUSD is a fungible asset with 8 decimals (1 ShelbyUSD = 1e8 micro-units).
 */
import { createHash } from 'node:crypto';
import { getDB } from './kv.js';

export const SHELBYUSD_DECIMALS = 8;

/** Convert whole ShelbyUSD to micro-units (integers, safe for on-chain amounts). */
export const shelbyUSDToMicro = (usd) => Math.round(usd * 10 ** SHELBYUSD_DECIMALS);
/** Convert micro-units back to whole ShelbyUSD. */
export const microToShelbyUSD = (micro) => micro / 10 ** SHELBYUSD_DECIMALS;

/** Fixed price table (whole ShelbyUSD per item). */
export const PRICE_TABLE = {
  marketplace_import: 0.01,
  dataset_stream: 1.5,
  download: 0.0001,
  inference: 0.0001,
};

export function priceFor(item) {
  const usd = PRICE_TABLE[item];
  if (usd == null) throw new Error(`Unknown payment item: ${item}`);
  return { usd, micro: shelbyUSDToMicro(usd) };
}

const INTENT_TTL_MS = 60 * 60 * 1000; // intents expire after 1 hour

export async function createPaymentIntent({ item, itemId, payer, receiver, description, amountShelbyUSD, tenantId = '' }) {
  // amountShelbyUSD overrides the fixed price table (used for listings with their own price).
  const { usd, micro } = amountShelbyUSD != null ? { usd: amountShelbyUSD, micro: shelbyUSDToMicro(amountShelbyUSD) } : priceFor(item);
  const db = getDB(tenantId);
  const now = Date.now();
  const id = createHash('sha256')
    .update(`${item}:${itemId}:${payer || 'anon'}:${now}:${Math.random().toString(36).slice(2)}`)
    .digest('hex')
    .slice(0, 20);
  const intent = {
    id,
    item,
    itemId,
    payer: payer || null,
    receiver: receiver || null,
    amountShelbyUSD: usd,
    amountMicro: micro,
    description: description || item,
    status: 'pending',
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + INTENT_TTL_MS).toISOString(),
    paidAt: null,
    txHash: null,
    sender: null,
    receiptHash: null,
  };
  await db.put(`pay:${id}`, JSON.stringify(intent));
  return intent;
}

export async function getPaymentIntent(id, tenantId = '') {
  const raw = await getDB(tenantId).get(`pay:${id}`);
  return raw ? JSON.parse(raw) : null;
}

export async function markIntentPaid(id, { txHash, sender, micropaymentBcs, tenantId = '' }) {
  const db = getDB(tenantId);
  const raw = await db.get(`pay:${id}`);
  if (!raw) return null;
  const intent = JSON.parse(raw);
  if (intent.status === 'paid') return intent;
  intent.status = 'paid';
  intent.paidAt = new Date().toISOString();
  intent.txHash = txHash || null;
  intent.sender = sender || intent.payer || null;
  intent.micropaymentBcs = micropaymentBcs || null;
  intent.receiptHash = createHash('sha256')
    .update(`${intent.id}:${intent.amountMicro}:${intent.paidAt}`)
    .digest('hex');
  await db.put(`pay:${id}`, JSON.stringify(intent));
  return intent;
}

export async function listPaymentIntents(tenantId = '') {
  const db = getDB(tenantId);
  const { keys } = await db.list({ prefix: 'pay:' });
  return (await Promise.all(keys.map(async ({ name }) => {
    const d = await db.get(name);
    return d ? JSON.parse(d) : null;
  }))).filter(Boolean);
}

/**
 * x402-style paywall support: resolve the pending intent for a paywalled
 * resource + payer, or create one. The pointer key makes quotes idempotent —
 * repeat unauthenticated requests for the same resource reuse the same intent
 * instead of spamming the intent list — until it is paid or expires.
 */
export async function findOrCreateIntent({ resourceKey, item, itemId, payer, receiver, description, tenantId = '' }) {
  const db = getDB(tenantId);
  const pointerKey = `paywall:${resourceKey}:${payer || 'anon'}`;
  const existingId = await db.get(pointerKey);
  if (existingId) {
    try {
      const intent = await getPaymentIntent(JSON.parse(existingId), tenantId);
      if (intent && intent.status === 'pending' && new Date(intent.expiresAt) > new Date()) return intent;
    } catch { /* stale/corrupt pointer — fall through and create a fresh intent */ }
  }
  const intent = await createPaymentIntent({ item, itemId, payer, receiver, description, tenantId });
  await db.put(pointerKey, JSON.stringify(intent.id));
  return intent;
}

/** Look up the paywall intent for a resource + payer without creating one. */
export async function getPaywallIntent(resourceKey, payer, tenantId = '') {
  const raw = await getDB(tenantId).get(`paywall:${resourceKey}:${payer || 'anon'}`);
  if (!raw) return null;
  try { return await getPaymentIntent(JSON.parse(raw), tenantId); } catch { return null; }
}
