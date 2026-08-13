/**
 * Live on-chain registry reader — Provenode ModelRegistry on Shelbynet.
 *
 * Reads REAL state from the deployed Move contract via the Shelbynet
 * Aptos-compatible RPC (view functions + account resources + events).
 * No keys required — this is public chain state.
 *
 * Contract (deployed + initialized on Shelbynet):
 *   0x77f8cb3dde7d8347cbaa1043889e79077489af6ed828e273f0283bfeccd39d18
 *
 * First recorded registration (live tx):
 *   0x81a369d1446bb1ee8fe8781e2593f9beddc20ce4427c90f3b54649ceca24d106
 *   ShelbyTest-v1.0 @ ledger version 28000828
 */

export const MODEL_REGISTRY_ADDRESS =
  process.env.MOVE_CONTRACT_ADDRESS || '0x77f8cb3dde7d8347cbaa1043889e79077489af6ed828e273f0283bfeccd39d18';

export const SHELBY_RPC =
  process.env.SHELBY_NETWORK === 'testnet'
    ? 'https://api.testnet.shelby.xyz/v1'
    : 'https://api.shelbynet.shelby.xyz/v1';

const fn = (name) => `${MODEL_REGISTRY_ADDRESS}::ModelRegistry::${name}`;

async function rpcGet(path) {
  const res = await fetch(`${SHELBY_RPC}${path}`);
  if (!res.ok) throw new Error(`Shelbynet RPC ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function rpcView(name, args) {
  const res = await fetch(`${SHELBY_RPC}/view`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ function: fn(name), type_arguments: [], arguments: args }),
  });
  if (!res.ok) throw new Error(`view ${name} failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** Chain metadata — proves we're reading the real Shelbynet ledger. */
export async function getChainInfo() {
  const info = await rpcGet('/');
  return {
    chainId: Number(info.chain_id),
    epoch: info.epoch,
    blockHeight: info.block_height,
    ledgerVersion: info.ledger_version,
    nodeRole: info.node_role,
    gitHash: info.git_hash,
  };
}

/** On-chain view: is this SHA-256 registered? Returns boolean. */
export async function verifyModelOnChain(sha256Hex) {
  const clean = sha256Hex.replace('0x', '').toLowerCase();
  const [result] = await rpcView('verify_model', [MODEL_REGISTRY_ADDRESS, `0x${clean}`]);
  return Boolean(result);
}

/** On-chain view: how many models are registered? */
export async function getModelCount() {
  const [count] = await rpcView('model_count', [MODEL_REGISTRY_ADDRESS]);
  return Number(count);
}

/** On-chain view: dataset + incident counts. */
export async function getDatasetCount() {
  const [count] = await rpcView('dataset_count', [MODEL_REGISTRY_ADDRESS]);
  return Number(count);
}

export async function getIncidentCount() {
  const [count] = await rpcView('incident_count', [MODEL_REGISTRY_ADDRESS]);
  return Number(count);
}

/** The full ModelRegistry resource — all stored records. */
export async function getRegistryResource() {
  const res = await rpcGet(`/accounts/${MODEL_REGISTRY_ADDRESS}/resource/${MODEL_REGISTRY_ADDRESS}::ModelRegistry::ModelRegistry`);
  return res.data || {};
}

/** Registration events (newest first) — each carries its ledger version. */
export async function getRegistrationEvents(limit = 50) {
  const events = await rpcGet(`/accounts/${MODEL_REGISTRY_ADDRESS}/events/${MODEL_REGISTRY_ADDRESS}::ModelRegistry::ModelRegistry/model_registered`);
  return (events || []).slice(0, limit).map((e) => ({
    ledgerVersion: String(e.version),
    sequenceNumber: e.sequence_number,
    modelName: e.data?.model_name || null,
    sha256: e.data?.sha256 || null,
    orgAddress: e.data?.org_address || null,
    timestampMicros: e.data?.timestamp || null,
  }));
}

/** Resolve a ledger version to its transaction hash + explorer URL. */
export async function getTxByVersion(version) {
  const t = await rpcGet(`/transactions/by_version/${version}`);
  return {
    hash: t.hash,
    sender: t.sender,
    timestamp: t.timestamp,
    explorerUrl: `https://explorer.aptoslabs.com/txn/${t.hash}?network=custom&customNetworkUrl=${encodeURIComponent(SHELBY_RPC)}`,
  };
}

/** One-shot status snapshot: chain + counts + first registration with its tx link. */
export async function getRegistryStatus() {
  const [chain, modelCount, datasetCount, incidentCount, events] = await Promise.all([
    getChainInfo(),
    getModelCount(),
    getDatasetCount(),
    getIncidentCount(),
    getRegistrationEvents(5),
  ]);
  let firstRegistration = null;
  if (events.length) {
    try {
      firstRegistration = { ...events[events.length - 1], tx: await getTxByVersion(events[events.length - 1].ledgerVersion) };
    } catch { firstRegistration = events[events.length - 1]; }
  }
  return {
    contractAddress: MODEL_REGISTRY_ADDRESS,
    network: process.env.SHELBY_NETWORK === 'testnet' ? 'testnet' : 'shelbynet',
    rpc: SHELBY_RPC,
    chain,
    modelCount,
    datasetCount,
    incidentCount,
    registrationEvents: events,
    firstRegistration,
  };
}
