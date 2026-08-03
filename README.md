# Provenode

AI model registry and edge fleet manager. Upload a model, register its SHA-256 on Aptos, deploy to edge devices, and verify integrity on every pull from Shelby storage.

## Overview

I'm building this to solve a specific problem: when you deploy AI models to hundreds of edge devices (cameras, robots, embedded systems), you have no way to prove the model running on a device is exactly what you signed off on. Provenode fixes that.

Every model gets:
1. Uploaded to [Shelby Protocol](https://shelby.xyz) (decentralized blob storage)
2. SHA-256 registered on Aptos via a Move contract
3. Signed with an Ed25519 key
4. Deployed to devices via OTA

Devices verify the SHA-256 against the on-chain record before loading. If it doesn't match, they reject it.

## Tech

- Aptos + Move — on-chain model registry
- Shelby Protocol — model storage (returns an object ID per upload)
- Node.js — serverless API on Vercel
- React + TypeScript — dashboard (Privy for auth)
- Upstash Redis — KV store for device/model state
- Resend — email alerts

## Contract

Network: Aptos Devnet  
Address: `0xcc19b66dd18fe15fe8e7f993d31a3feaac5cb17cebe33ff60641e783adcdb21f`  
Module: `ModelRegistry`

```move
// Setup
initialize(account)

// Models
register_model(account, sha256, shelby_object_id, name, version, id)
mark_signed(account, sha256)
deactivate_model(account, sha256)

// Datasets
register_dataset(account, id, name, merkle_root, shard_count, total_bytes, license, source)

// Provenance
log_provenance(account, child_model_id, parent_model_id, operation, node_hash)

// Incidents
log_incident(account, id, device_id, model_id, old_sha256, new_sha256)

// Views
verify_model(address, sha256): bool
model_count(address): u64
dataset_count(address): u64
incident_count(address): u64
```

## Getting started

```bash
git clone https://github.com/salch-cred/provenode.git
cd provenode
npm install
cp .env.example .env.local
npm run dev
```

Minimum env vars to run:

```env
KV_REST_API_URL=
KV_REST_API_TOKEN=
DEPLOY_SECRET=any_secret_string
CRON_SECRET=any_secret_string
```

To actually use Shelby storage:

```env
SHELBY_API_KEY=        # from shelby.xyz
SHELBY_PRIVATE_KEY=    # your Ed25519 private key hex
```

Without `SHELBY_API_KEY` it runs in demo mode — uploads return a fake `demo://` object ID, nothing goes to Shelby.

## Deploy the contract

```bash
# Install Aptos CLI
curl -fsSL https://aptos.dev/scripts/install_cli.py | python3

# Create a profile
aptos init --profile default --network devnet

# Fund it
aptos account fund-with-faucet --profile default

# Compile
cd contract
aptos move compile --named-addresses provenode_addr=$(aptos account lookup-address --profile default | python3 -c "import json,sys; print(json.load(sys.stdin)['Result'])")

# Publish
aptos move publish --profile default --named-addresses provenode_addr=<your_address>

# Initialize the registry
aptos move run --function-id <your_address>::ModelRegistry::initialize

# Verify it works
aptos move view --function-id <your_address>::ModelRegistry::model_count --args address:<your_address>
# should return 0
```

Set `MOVE_CONTRACT_ADDRESS=<your_address>` in your env.

## API

All POST/PATCH/DELETE routes require `X-Provenode-Token: <DEPLOY_SECRET>` header.

```
POST   /api/upload              upload model file → Shelby + on-chain registration
GET    /api/models              list all models
GET    /api/verify?id=X         verify model SHA-256 on-chain
POST   /api/sign                sign model with org key
POST   /api/deploy              deploy model to fleet
GET    /api/status?id=X         deployment progress

POST   /api/devices             register a device
DELETE /api/devices?id=X        remove device
POST   /api/fleet               push OTA to devices
GET    /api/fleet/:deviceId     device status

POST   /api/selfheal            device reports current SHA, gets heal command if tampered
PATCH  /api/selfheal            device confirms heal done
GET    /api/selfheal            fleet health (% healthy, list of tampered devices)

POST   /api/stream-inference    split model into 5MB chunks, upload each to Shelby
GET    /api/stream-inference?modelId=X&chunk=0   get one chunk

POST   /api/federated           device submits gradient update
PATCH  /api/federated           aggregate round (FedAvg) → new model blob on Shelby
GET    /api/federated?modelId   list rounds

POST   /api/delta               register a delta version (diff only, not full model)
GET    /api/delta?modelId=X     version history DAG

POST   /api/datasets            register training dataset with Merkle root
GET    /api/datasets
DELETE /api/datasets            GDPR deletion request

POST   /api/provenance          add lineage node (model B was fine-tuned from model A)
GET    /api/provenance?modelId  full lineage chain

POST   /api/zkproof             generate commitment proof, store on Shelby
GET    /api/zkproof?modelId     verify proof

POST   /api/telemetry           batch inference events (latency, confidence, device)
GET    /api/telemetry?modelId   aggregated stats per hour

POST   /api/bridge              create cross-chain attestation (Solana / Ethereum)
GET    /api/bridge

POST   /api/webhooks            register webhook (fires on model events)
GET    /api/audit               audit log
```

## How Shelby storage works here

When you upload a model:

1. File goes to `POST /api/upload`
2. API computes SHA-256 of the file
3. Calls `ShelbyClient.upload()` — returns an object ID like `shelby://shelbynet/<address>/models/<name>`
4. Calls `ModelRegistry::register_model()` on Aptos with that object ID + SHA-256
5. Returns `{ id, hash, objectId, mode }`

When a device pulls the model:

1. Device calls `GET /api/verify?id=X` to get the on-chain SHA-256 and Shelby object ID
2. Device fetches the blob from Shelby by object ID
3. Device computes SHA-256 of downloaded file
4. Compares against on-chain value — loads if match, rejects if not

Streaming inference works the same way but splits the model into 5MB chunks first. Each chunk is a separate Shelby blob. Devices fetch chunk 0, start processing, fetch chunk 1, and so on.

## Crons

Both run as Vercel cron functions. Both need `Authorization: Bearer <CRON_SECRET>`.

`GET /api/crons/tamper-check` — daily at 18:00 UTC  
Loops through models in Shelby, checks if the blobs are still reachable. Marks as tampered + sends alert if a blob returns 404.

`GET /api/crons/expiry-check` — daily at 06:00 UTC  
Checks Shelby object expiry dates. Sends email alert if anything expires within 7 days.

## Env vars

| Variable | Required | What it's for |
|---|---|---|
| `KV_REST_API_URL` | yes | Upstash Redis |
| `KV_REST_API_TOKEN` | yes | Upstash Redis |
| `DEPLOY_SECRET` | yes | API auth token |
| `CRON_SECRET` | yes | Cron auth token |
| `SHELBY_API_KEY` | no | Shelby uploads (demo mode without it) |
| `SHELBY_PRIVATE_KEY` | no | Ed25519 key for signing + persistent Shelby identity |
| `SHELBY_NETWORK` | no | `shelbynet` or `mainnet` |
| `RESEND_API_KEY` | no | Email alerts |
| `ALERT_EMAIL` | no | Where tamper/expiry alerts go |
| `MOVE_CONTRACT_ADDRESS` | no | Your deployed contract address |
| `ALLOWED_ORIGIN` | no | CORS origin (defaults to Vercel URL) |
| `SIGN_KEY` | no | Separate signing key if different from SHELBY_PRIVATE_KEY |

## Status

Working on devnet. Contract deployed and tested. Shelby integration runs in demo mode by default, real mode with an API key.

Things still in progress:
- Frontend pages for streaming inference, FL, and dataset registry
- Shelby mainnet testing
- Device SDK (currently devices just call the REST API directly)
