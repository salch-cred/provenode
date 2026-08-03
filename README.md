# Provenode

On-chain AI model registry and edge fleet deployment tool built on Aptos + Shelby Protocol.

Upload a model, get a SHA-256 registered on-chain, deploy to edge devices, verify integrity on every pull.

---

## What it does

- Upload AI models (ONNX, TFLite, GGUF, bin) to Shelby Protocol decentralized storage
- Register the model SHA-256 on Aptos via a Move smart contract
- Deploy models to edge device fleets over-the-air
- Verify model integrity on device — reject anything that doesn't match the on-chain hash
- Sign models with Ed25519 keys so devices know the model came from your org
- Monitor fleet health, detect tampered devices, auto-heal via Shelby objectId
- Track model lineage (what was fine-tuned from what, on which datasets)

## Stack

- **Blockchain:** Aptos (Move smart contract)
- **Storage:** Shelby Protocol (decentralized blob storage)
- **API:** Node.js serverless functions on Vercel
- **Frontend:** React + TypeScript + Privy auth
- **Database:** Upstash Redis (KV)
- **Notifications:** Resend (email), webhooks

## Contract

```
Address: 0xcc19b66dd18fe15fe8e7f993d31a3feaac5cb17cebe33ff60641e783adcdb21f
Network: Aptos Devnet
Module:  ModelRegistry
```

Functions:
- `initialize(account)` — set up registry for an org
- `register_model(account, sha256, shelby_object_id, name, version, id)`
- `mark_signed(account, sha256)` — mark model as Ed25519 signed
- `deactivate_model(account, sha256)` — revoke a model
- `register_dataset(account, id, name, merkle_root, shard_count, total_bytes, license, source)`
- `log_provenance(account, child_model_id, parent_model_id, operation, node_hash)`
- `log_incident(account, id, device_id, model_id, old_sha256, new_sha256)`

View functions:
- `verify_model(address, sha256): bool`
- `model_count(address): u64`
- `dataset_count(address): u64`
- `incident_count(address): u64`

## API Routes

```
# Core
GET  /api/health
GET  /api/config
POST /api/upload              upload model to Shelby, register SHA-256
GET  /api/models              list registered models
GET  /api/verify?id=X         verify model on-chain
POST /api/sign                sign model with org Ed25519 key
POST /api/deploy              push model to fleet
GET  /api/status?id=X         deployment status

# Devices & Fleet
POST   /api/devices           register edge device
DELETE /api/devices?id=X      remove device
POST   /api/fleet             push OTA update
GET    /api/fleet/:deviceId   device status

# Self-Healing
POST   /api/selfheal          device reports current SHA → tamper check → auto-heal
PATCH  /api/selfheal          device confirms heal complete
GET    /api/selfheal          fleet health overview

# Model Streaming
POST /api/stream-inference?modelId=X   split model into Shelby chunks
GET  /api/stream-inference?modelId=X&chunk=0  fetch individual chunk

# Federated Learning
POST  /api/federated          submit gradient update from device
PATCH /api/federated          aggregate round (FedAvg)
GET   /api/federated?modelId  list rounds

# Delta Versions
POST /api/delta               register delta version (diff-only upload)
GET  /api/delta?modelId=X     version DAG

# Provenance & Datasets
POST /api/provenance          add provenance node (parent → child model)
GET  /api/provenance?modelId  full lineage chain
POST /api/datasets            register training dataset
GET  /api/datasets            list datasets
DELETE /api/datasets          GDPR deletion request

# ZK Proofs
POST /api/zkproof?modelId=X   generate commitment proof, upload to Shelby
GET  /api/zkproof?modelId=X   verify proof

# Analytics
POST /api/telemetry           ingest inference events
GET  /api/telemetry?modelId   stats (latency, confidence, throughput)

# Cross-chain
POST /api/bridge              create attestation on Solana or Ethereum
GET  /api/bridge              list attestations

# Other
GET  /api/lineage?id=X        model lineage graph
POST /api/webhooks            register webhook
POST /api/marketplace         list model for sale
GET  /api/audit               audit log
```

## Setup

```bash
git clone https://github.com/salch-cred/provenode.git
cd provenode
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

```env
# Required
KV_REST_API_URL=
KV_REST_API_TOKEN=
DEPLOY_SECRET=

# Shelby Protocol (get from shelby.xyz)
SHELBY_API_KEY=
SHELBY_PRIVATE_KEY=   # Ed25519 hex key

# Optional
RESEND_API_KEY=
ALERT_EMAIL=
MOVE_CONTRACT_ADDRESS=
ALLOWED_ORIGIN=
```

Run dev server:

```bash
npm run dev
```

## Deploy contract

Requires Aptos CLI:

```bash
# Install CLI
curl -fsSL https://aptos.dev/scripts/install_cli.py | python3

# Fund account from devnet faucet
aptos account fund-with-faucet \
  --account <your_address> \
  --faucet-url https://faucet.devnet.aptoslabs.com

# Compile
cd contract
aptos move compile \
  --named-addresses provenode_addr=<your_address>

# Publish
aptos move publish \
  --profile default \
  --named-addresses provenode_addr=<your_address>

# Initialize
aptos move run \
  --function-id <your_address>::ModelRegistry::initialize
```

## Shelby Protocol

Models are stored on [Shelby Protocol](https://shelby.xyz) — decentralized blob storage built on Aptos.

- Each model file is uploaded as a blob, returns a `shelby://` object ID
- The object ID + SHA-256 are stored on-chain in `ModelRegistry`
- Edge devices fetch the blob by object ID, verify SHA-256 locally before loading
- If SHA-256 doesn't match what's on-chain, the device rejects the model

Streaming inference splits the model into 5MB chunks, each uploaded as a separate Shelby blob. Devices fetch the next chunk while processing the current one.

Delta uploads store only the binary diff between model versions. Base model is uploaded once; subsequent fine-tunes upload only the changed bytes (typically 1–5% of model size).

## Federated Learning

Devices train locally, upload gradient updates to Shelby:

```
POST /api/federated
{
  "modelId": "model-001",
  "deviceId": "cam-001",
  "gradientHex": "...",
  "sampleCount": 500,
  "roundNumber": 1
}
```

Once enough devices have submitted, call PATCH to aggregate:

```
PATCH /api/federated
{ "modelId": "model-001", "roundNumber": 1 }
```

Aggregated gradient uploaded to Shelby. Each device gets an on-chain receipt proving their data was included.

## Dataset Registry

Register training datasets on Shelby + link them to model versions:

```
POST /api/datasets
{
  "name": "my-training-set",
  "merkleRoot": "...",
  "shardCount": 100,
  "license": "MIT",
  "source": "huggingface.co/datasets/...",
  "modelIds": ["model-001"]
}
```

Computes Merkle root of all shard SHA-256s, registers on-chain. Links dataset to model versions so you can trace what any model was trained on.

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `KV_REST_API_URL` | Yes | Upstash Redis REST URL |
| `KV_REST_API_TOKEN` | Yes | Upstash Redis token |
| `DEPLOY_SECRET` | Yes | Auth token for all mutating API calls |
| `CRON_SECRET` | Yes | Auth token for cron jobs |
| `SHELBY_API_KEY` | No | Shelby API key (demo mode without it) |
| `SHELBY_PRIVATE_KEY` | No | Ed25519 hex key for persistent org identity |
| `SHELBY_NETWORK` | No | `shelbynet` or `mainnet` (default: shelbynet) |
| `RESEND_API_KEY` | No | Email alerts |
| `ALERT_EMAIL` | No | Where to send tamper/expiry alerts |
| `MOVE_CONTRACT_ADDRESS` | No | Deployed Aptos contract address |
| `ALLOWED_ORIGIN` | No | CORS allowed origin (defaults to VERCEL_URL) |

## Crons

Defined in `vercel.json`:

- `GET /api/crons/tamper-check` — runs daily at 18:00 UTC, samples models from Shelby, checks integrity
- `GET /api/crons/expiry-check` — runs daily at 06:00 UTC, warns on Shelby objects expiring within 7 days

Both require `Authorization: Bearer <CRON_SECRET>` header (injected automatically by Vercel).

## License

MIT
