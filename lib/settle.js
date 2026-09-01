/**
 * Shared SenderBuiltMicropayment settlement.
 *
 * Used by both the POST /api/payments { action: "verify" } route and the
 * x402-style pay-per-read flow on GET /api/objects/:id/blob, so the verify /
 * settle rules exist in exactly one place:
 *
 *   1. SHELBY_PRIVATE_KEY + SHELBY_API_KEY must be configured (503 otherwise).
 *   2. The BCS payload must deserialize (400 otherwise).
 *   3. The payment must be addressed to this deployment's org account (400).
 *   4. It must be denominated in ShelbyUSD (400).
 *   5. Its amount must cover the intent (402 with the shortfall otherwise).
 *   6. On-chain settlement via ShelbyMicropaymentChannelClient.receiverWithdraw
 *      (502 if the chain rejects it).
 *   7. The intent is marked paid and a receipt hash is recorded.
 *
 * Resolves to { status, body } — an HTTP-ready response — plus `mp` and
 * `paid` on success so callers can attach receipts.
 */
import { markIntentPaid } from './payments.js';
import { logAudit } from './audit.js';

export async function settleMicropayment({ intent, micropaymentBcs, sender, tenantId = '', env = process.env }) {
  const privKey = env.SHELBY_PRIVATE_KEY;
  const apiKey = env.SHELBY_API_KEY;
  if (!privKey || !apiKey) {
    return { status: 503, body: { error: 'SHELBY_PRIVATE_KEY and SHELBY_API_KEY required for payment settlement.' } };
  }

  const { ShelbyMicropaymentChannelClient, SenderBuiltMicropayment, SHELBYUSD_FA_METADATA_ADDRESS } = await import('@shelby-protocol/sdk/node');
  const { Network, Ed25519Account, Ed25519PrivateKey } = await import('@aptos-labs/ts-sdk');

  let mp;
  try {
    mp = SenderBuiltMicropayment.deserialize(micropaymentBcs);
  } catch (e) {
    return { status: 400, body: { error: 'Invalid micropayment BCS.', detail: e.message } };
  }

  // Verify the payment is addressed to us, in ShelbyUSD, and covers the intent.
  const receiverAddr = new Ed25519Account({ privateKey: new Ed25519PrivateKey(privKey) }).accountAddress.toString();
  if (mp.receiver.toString() !== receiverAddr) {
    return { status: 400, body: { error: 'Micropayment receiver does not match this deployment.' } };
  }
  if (mp.fungibleAssetAddress.toString() !== SHELBYUSD_FA_METADATA_ADDRESS) {
    return { status: 400, body: { error: 'Micropayment is not denominated in ShelbyUSD.' } };
  }
  if (Number(mp.amount) < intent.amountMicro) {
    return { status: 402, body: { error: 'Micropayment amount is less than required.', requiredMicro: intent.amountMicro, paidMicro: Number(mp.amount) } };
  }

  // Settle on-chain: withdraw the channel payment to the org account.
  const networkStr = env.SHELBY_NETWORK || 'shelbynet';
  const network = networkStr === 'shelbynet' ? Network.SHELBYNET : Network.TESTNET;
  const mpClient = new ShelbyMicropaymentChannelClient({ network, apiKey });
  const receiver = new Ed25519Account({ privateKey: new Ed25519PrivateKey(privKey) });
  let txHash;
  try {
    const { transaction } = await mpClient.receiverWithdraw({ receiver, micropayment: mp });
    txHash = transaction.hash;
  } catch (err) {
    console.error('[payments] settle failed:', err.message);
    return { status: 502, body: { error: `On-chain settlement failed: ${err.message}` } };
  }

  const paid = await markIntentPaid(intent.id, { txHash, sender, micropaymentBcs, tenantId });
  await logAudit('payment.settled', { actor: sender || mp.sender.toString(), target: intent.itemId, details: { intentId: intent.id, amountMicro: intent.amountMicro, txHash }, tenantId });
  return { status: 200, body: { success: true, status: 'paid', intent: paid, txHash, receiptHash: paid.receiptHash }, mp, paid };
}
