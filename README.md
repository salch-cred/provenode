# Provenode

**The decentralized model lifecycle platform — deploy, verify, and monetize AI models with cryptographic proof, on Shelby.**

Provenode is an enterprise-grade AI model registry and decentralized fleet manager. Every model is anchored on the Shelby Protocol (Shelbynet), signed with Ed25519 keys, and verifiable on-chain — so edge devices execute *only* models whose integrity has been mathematically proven.

There are no demo modes and no fallback fabrication: when Shelby or signing credentials are absent, routes fail cleanly with `503`/`402`/`400` rather than inventing a result. Records that predate this policy are being purged — see [Data provenance](#data-provenance) for exactly what is real today.

## Why Provenode

Deploying AI to decentralized edge infrastructure (cameras, vehicles, embedded systems) creates a critical trust problem: standard orchestrators use mutable databases that cannot *prove* which model is actually running. Provenode closes that gap with cryptographic provenance at every stage of the lifecycle:

1. **Immutable storage** — model weights are uploaded to Shelby Protocol blobs.
2. **Ownership passports** — every model gets a signed certificate (SHA-256 + org + timestamp), anchored on-chain via the Move `ModelRegistry` contract or as an immutable Shelby blob.
3. **On-chain registry** — SHA-256 digests and storage object IDs are anchored to Aptos via Move.
4. **Edge enforcement** — devices mathematically verify the digest against the registry before initialization; any mismatch triggers tamper detection, an incident record, and an automatic heal command.
5. **Monetization** — marketplace listings, dataset streams, and model imports settle in ShelbyUSD micropayments, verifiable on-chain.

## Core Features

- **Model Passports** — signed ownership certificates with SHA-256, org address, and timestamp; check any weights file by hash to see its legal origin. Behavioral fingerprinting (canary-output comparison) catches *edited* copies that hash-checking alone misses.
- **Real Shelby mode** — blob upload/download, manifest anchoring, and checkpoint resume all run against the Shelbynet API. Unconfigured paths fail cleanly (503/402/400) — they never fabricate data.
- **Fleet integrity & self-healing** — per-device SHA verification, tamper detection, incident records, and auto-issued heal commands.
- **Canary deployments & OTA** — phased fleet rollouts (10/25/50/100%) with automated rollback thresholds and blue-green slot switching.
- **Execution attestations** — ECDSA-free, Ed25519 org-signed proofs over benchmark test vectors, demonstrating a committed model produced given outputs without exposing weights. This is a signed attestation, **not** a zk-SNARK: it proves the org asserts the input→output mapping for a committed digest, verified against the org's published key.
- **Federated learning** — `Float32Array` tensor aggregation (FedAvg) on serverless architecture, with per-round receipts anchored on-chain. The aggregation math is real; it requires edge clients that train locally and submit gradients.
- **Dataset sharding & Merkle roots** — binary chunking with native SHA-256 Merkle root generation for EU AI Act compliance; paid stream access gated by settled ShelbyUSD intents.
- **ShelbyUSD micropayments** — payment intents priced server-side, settled on-chain via `SenderBuiltMicropayment` BCS, with receipts and audit trails.
- **Marketplace** — publish models with per-listing prices; imports require a settled, single-use intent for that exact listing at that exact price.
- **Shelby Sites** — deploy static websites to immutable Shelby blobs (ZIP upload or GitHub push-to-deploy), served at `/s/<slug>` with instant rollback.
- **Distillation, A/B test locks, lineage DAGs, compliance export, webhooks, audit log** — the supporting enterprise surface.

## MCP Server

Provenode ships a **Model Context Protocol server** (`mcp/`) so AI agents can operate the platform directly: deploy models, verify fleets, check passports, and create/settle payments. Works over stdio (Claude Desktop, Cursor) or Streamable HTTP.

```bash
cd mcp && npm install
PROVENODE_API_URL=https://your-app.vercel.app/api PROVENODE_TOKEN=<deploy-secret> node src/index.js
```

See [`mcp/README.md`](mcp/README.md) for tools, env vars, and client configuration.

## Built on Shelby

Provenode is a Shelby Early Access builder project. It runs against **three Shelby protocol primitives** — not just storage:

| Primitive | How Provenode uses it |
|---|---|
| **Blob storage** | Model weights, passports, and datasets are uploaded as Shelby blobs via `@shelby-protocol/sdk` (`ShelbyNodeClient`, Ed25519 signer, 90-day expiry), with checkpoint resume against the Shelbynet API. |
| **ShelbyUSD micropayments** | Marketplace listings, dataset streams, and model imports are gated by server-priced payment intents settled on-chain via `SenderBuiltMicropayment` BCS (8-decimal micro-units). |
| **On-chain anchoring** | SHA-256 digests and storage object IDs are anchored on Aptos via the Move `ModelRegistry` contract (`contract/sources/ModelRegistry.move`). |

- Shelby contract (blob storage): `0x85fdb9a176ab8ef1d9d9c1b60d60b3924f0800ac1de1cc2085fb0b8bb4988e6a`
- Provenode `ModelRegistry`: `0x77f8cb3dde7d8347cbaa1043889e79077489af6ed828e273f0283bfeccd39d18`
- Network: **Shelbynet** (chain id `118`) — RPC `https://api.shelbynet.shelby.xyz/shelby`, blobs at `/shelby/v1/blobs/{address}/{blobName}`
- Explorer: Shelbynet has no first-party explorer UI for arbitrary transactions, so all links use the **Aptos Explorer in custom-network mode** against the Shelbynet RPC. Every link is built by `explorerUrl()` in [`lib/registry.js`](lib/registry.js) and exposed to the frontend via `GET /api/config` — one explorer of record, no hardcoded hosts. [View the registry account.](https://explorer.aptoslabs.com/account/0x77f8cb3dde7d8347cbaa1043889e79077489af6ed828e273f0283bfeccd39d18?network=custom&customNetworkUrl=https%3A%2F%2Fapi.shelbynet.shelby.xyz%2Fv1)

Docs: [docs.shelby.xyz](https://docs.shelby.xyz) · Apply for Early Access: [developers.shelby.xyz](https://developers.shelby.xyz)

## Data provenance

This section states plainly which on-chain data is real, because the claim "no simulated data" is only worth making if it is auditable.

**Verifiable right now, with zero credentials:**

```bash
curl https://api.shelbynet.shelby.xyz/v1                    # chain_id must be 118
curl -X POST https://api.shelbynet.shelby.xyz/v1/view \
  -H 'Content-Type: application/json' \
  -d '{"function":"0x77f8cb3dde7d8347cbaa1043889e79077489af6ed828e273f0283bfeccd39d18::ModelRegistry::model_count","type_arguments":[],"arguments":["0x77f8cb3dde7d8347cbaa1043889e79077489af6ed828e273f0283bfeccd39d18"]}'
```

| Fact | Status |
|---|---|
| `ModelRegistry` deployed and initialized on Shelbynet | **Real** — resource exists at the address above |
| First registration tx `0x81a369d1…d106` @ ledger 28,000,828 | **Real transaction** |
| The SHA-256 inside that first registration | **Placeholder** — `0xaabbccdd…` repeated, from contract bring-up. Not a real model digest. |
| `model_count` | Currently `1`, and that one entry is the placeholder above |
| Shelby blob upload / download / expiry-renewal | **Real** — runs against the Shelbynet API; fails with `503` when unconfigured |
| ShelbyUSD micropayment settlement | **Real** — `receiverWithdraw` on-chain; no bypass path |

Two maintenance scripts exist to close the gap, both **dry-run by default**:

```bash
# List every placeholder / fuzz record it would delete, and why. Writes nothing.
node scripts/purge-demo-records.mjs
node scripts/purge-demo-records.mjs --apply --yes     # destructive; writes a JSON backup first

# Verify all preconditions and compute a real digest locally, then stop.
node scripts/real-e2e-run.mjs --file ./your-model.onnx --name "YourModel"
node scripts/real-e2e-run.mjs --file ./your-model.onnx --name "YourModel" --apply --yes
```

Known gaps are tracked in [`docs/reports/ENGINEERING_REPORT.md`](docs/reports/ENGINEERING_REPORT.md) rather than omitted.

## Technology Stack

- **Blockchain / settlement** — Aptos (Move), ShelbyUSD micropayments
- **Decentralized storage** — Shelby Protocol (Shelbynet)
- **Backend** — Node.js, Vercel Serverless Functions, Upstash Redis
- **Frontend** — React, TypeScript, Vite, Docusaurus (docs)
- **Auth** — Privy (wallet auth), wagmi/viem

## Quick Start

```bash
git clone https://github.com/salch-cred/provenode.git
cd provenode
npm install
cp .env.example .env.local
npm run dev
```

### Environment Configuration

Copy `.env.example` to `.env.local`. Minimum for local execution:

```env
KV_REST_API_URL=<upstash_url>
KV_REST_API_TOKEN=<upstash_token>
DEPLOY_SECRET=<authentication_secret>
CRON_SECRET=<cron_secret>
```

For **real Shelby mode** (uploads, anchors, payments):

```env
SHELBY_API_KEY=<shelby_api_key>          # https://shelby.network
SHELBY_PRIVATE_KEY=<ed25519_private_key_hex>
SHELBY_NETWORK=shelbynet                 # real network (default) | testnet
```

Optional: `MOVE_CONTRACT_ADDRESS` (after deploying `contract/sources/ModelRegistry.move`), `SIGN_KEY`, `RESEND_API_KEY`, `ALERT_EMAIL`, `VITE_PRIVY_APP_ID`, `VITE_WC_PROJECT_ID`.

## Smart Contract

The Move contract manages the immutable registry of models, datasets, and federated rounds.

```bash
cd contract
aptos move compile --named-addresses provenode_addr=<your_address>
aptos move publish --profile default --named-addresses provenode_addr=<your_address>
```

Network: **Shelbynet** (real) — testnet is an explicit opt-out via `SHELBY_NETWORK=testnet`.

## API Reference

The backend exposes a comprehensive REST API for CI/CD and edge-device integration. All mutating endpoints require the `X-Provenode-Token` header. Full reference at `GET /api/docs`.

**Model lifecycle**
- `POST /api/upload` — model ingestion + Shelby blob + passport auto-issue
- `POST /api/deploy` — fleet OTA distribution
- `GET /api/status` — deployment progress
- `POST /api/selfheal` — device integrity report / auto-heal

**Proof & provenance**
- `POST /api/passport/check` — weights file → provenance verdict (public)
- `GET /api/passport/:modelId` — ownership certificate (public)
- `POST /api/passport/:modelId/verify-copy` — behavioral copy check
- `POST /api/zkproof/generate/:modelId` — org-signed execution attestation over real test vectors
- `GET /api/lineage` — model provenance DAG

**Data & training**
- `POST /api/datasets` — register sharded dataset + Merkle root
- `POST /api/federated` / `PATCH /api/federated` — gradient submission / merging
- `POST /api/distillation` — teacher/student distillation jobs

**Money**
- `POST /api/payments` — create or settle a ShelbyUSD payment intent
- `GET /api/marketplace` / `POST /api/marketplace` — listing + import with payment gating
- `GET /api/earnings` — settlement history

### Pay-per-read (x402-style) on blob downloads

`GET /api/objects/:id/blob` monetizes real downloads with ShelbyUSD micropayments. Requests carrying a valid `X-Provenode-Token` (admin) download free; everyone else gets the two-step flow:

1. **Quote** — `GET /api/objects/:id/blob` without payment headers returns `402` with an `x402` block: `intentId`, `amountMicro` (price table: `download` = 0.0001 ShelbyUSD), the receiver address, and the ShelbyUSD token addresses. Repeat quotes reuse the same pending intent (idempotent).
2. **Pay + download** — build a `SenderBuiltMicropayment` to the receiver for `amountMicro` micro-units (8 decimals), then retry with `X-Payment: <BCS hex>` (optionally `X-Payment-Intent: <intentId>`). The server verifies receiver, denomination, and amount, settles on-chain via `receiverWithdraw`, streams the blob, and returns a base64 receipt in `X-Payment-Response` (`{ intentId, txHash, receiptHash, amountMicro }`). Replays after settlement are free and still carry the receipt.

Set `PAYWALL_MODE=off` to restore auth-only downloads (401 for strangers). Every settlement is recorded in the audit log and appears in `GET /api/earnings`.

## Documentation

Architecture docs and integration guides: [provenodes.xyz/docs](https://www.provenodes.xyz/docs).

## Security

See [SECURITY.md](SECURITY.md) for the vulnerability disclosure policy and security posture.

## License

All rights reserved. Contact the maintainers for commercial licensing.
