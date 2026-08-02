# Provenode

Verified AI model deployment for edge fleets, built on Shelby shelbynet.

You upload a model file. Provenode computes its SHA-256, registers it as an immutable Shelby object, and creates a signed deployment manifest. Every device in your fleet downloads the object, re-hashes it locally, and only activates the model if the digest matches. No match — the device keeps the previous model and fires an alert.

Live: https://provenode-seven.vercel.app

---

## What problem this solves

When you push a new CV model to 248 cameras across four regions, you have no reliable way to verify that every device received the exact file you approved. Filenames change, CDN caches corrupt, partial downloads happen silently. The standard answer is "trust the orchestrator" — which means trusting a database you can edit.

Shelby objects are immutable. Once written, they have a permanent on-chain address. Provenode uses that property to turn model deployment from a hope into a proof.

---

## Deploy to Vercel

Clone the repo and connect it to a Vercel project:

```bash
git clone https://github.com/salch-cred/provenode
vercel link
vercel --prod
```

Required build settings:

```
Build Command:   npm run build
Output Dir:      dist
Install Command: npm install
Node version:    24.x
```

Add a Vercel KV store (Storage tab in the dashboard). The KV env vars inject automatically.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `SHELBY_API_KEY` | Production only | From dashboard.shelby.network — enables real on-chain uploads. Without it the app runs in demo mode. |
| `SHELBY_PRIVATE_KEY` | Production only | Your org's persistent Aptos Ed25519 private key. Devices can whitelist your public key. |
| `SHELBY_NETWORK` | All | Set to `shelbynet`. |
| `VITE_PRIVY_APP_ID` | All | From dashboard.privy.io — enables the login screen. App still works without it. |
| `VITE_WC_PROJECT_ID` | All | From cloud.walletconnect.com — enables WalletConnect in the login flow. |
| `CRON_SECRET` | All | Protects the daily cron endpoints from public access. |
| `DEPLOY_SECRET` | All | Required in the `X-Provenode-Token` header when POSTing to `/api/status`. |
| `RESEND_API_KEY` | Optional | Enables email alerts on deployments, integrity mismatches, and expiring objects. |
| `ALERT_EMAIL` | Optional | Where alert emails go. |

Generate a persistent org key (run once, store in `SHELBY_PRIVATE_KEY`):

```bash
node -e "const {Account}=require('@aptos-labs/ts-sdk'); const a=Account.generate(); console.log(a.privateKey.toString());"
```

Fund the account:

```bash
curl -X POST https://provenode-seven.vercel.app/api/identity
```

---

## Tech stack

**Frontend** — React 18, TypeScript, Vite, React Router v6, Privy (email / passkey / wallet auth), wagmi v2 (MetaMask, WalletConnect, Coinbase Wallet), HugeIcons stroke-rounded

**Backend** — Vercel serverless functions (Node 24, single mega-router at `/api/index.js`), Upstash Redis via `@upstash/redis`, `@shelby-protocol/sdk`, `@aptos-labs/ts-sdk`

**Storage** — Vercel KV (Upstash Redis) for all state. Shelby shelbynet for immutable model objects and deployment manifests.

**Blockchain** — Aptos-based Shelbynet. A Move contract (`contract/sources/ModelRegistry.move`) registers every model on-chain.

---

## API routes

All routes are handled by a single serverless function at `/api/index.js` (Vercel Hobby plan: max 12 functions, this counts as 1).

```
POST /api/upload          Upload a model file. Computes SHA-256, writes Shelby object, stores in KV.
POST /api/deploy          Deploy a registered model. Creates on-chain manifest, starts canary if requested.
GET  /api/status          List deployments, or GET /api/status?id= for a single one.
POST /api/status          Device reports verification (requires X-Provenode-Token header).
GET  /api/models          List registered models.
GET  /api/identity        Org on-chain address. POST to fund from faucet.
GET  /api/objects         Shelby object list with expiry status.
GET  /api/lineage?modelId=  Ancestor/descendant graph for a model.
POST /api/import          Import from HuggingFace Hub: fetch, hash, push to Shelby.
GET  /api/devices         Registered edge devices. POST to register, PATCH to update.
GET  /api/fleet/:id/pending    OTA: what model should this device pull.
POST /api/fleet/:id/report     Device reports hash match or mismatch.
POST /api/fleet/canary/:id/advance   Advance canary stage.
POST /api/fleet/canary/:id/rollback  Roll back.
POST /api/abtest          Create an A/B test between two model versions.
GET  /api/marketplace     Browse published models. POST to publish or import.
GET  /api/analytics       Fleet device summary or per-device time series.
POST /api/schedule        Schedule a deployment for a future datetime.
GET  /api/groups          Fleet groups with tag-based selectors.
POST /api/bluegreen       Configure blue/green slots. POST /api/bluegreen/switch to swap.
GET  /api/audit           Immutable audit log. Every action is KV-persisted.
GET  /api/compliance      Compliance report for a date range. format=csv for CSV export.
GET  /api/webhooks        Registered webhooks. POST to register, DELETE to remove.
POST /api/sign            Sign a model's SHA-256 with your org key.
GET  /api/metrics         Prometheus text format. Point Grafana at this.
GET  /api/stream?deploymentId=  SSE stream for live deployment progress.
GET  /api/docs            OpenAPI 3.1 spec.
GET  /api/health          Service health check.
GET  /api/shelby-status   Whether Shelby is in production or demo mode.
```

---

## Python SDK

```bash
pip install provenode-sdk
```

```python
from provenode import ProvenodeClient

client = ProvenodeClient("https://provenode-seven.vercel.app")

model = client.upload("./vision_edge.onnx", name="Vision Edge v3", tags=["onnx", "arm64"])
print(model.sha256)

deployment = client.deploy(model.id, region="Asia-Pacific", canary=True)

# Block until 100% verified
deployment = client.wait(deployment.id, on_progress=lambda d: print(f"{d.progress}%"))
print(deployment.status)  # "verified"

# Pull from HuggingFace and deploy in one call
model = client.import_huggingface("ultralytics/yolov8n", "yolov8n.onnx")
client.deploy(model.id, region="Global")
```

SDK source lives in `sdk/python/`.

---

## GitHub Action

```yaml
- uses: ./.github/actions/deploy-model
  with:
    model-path: ./models/latest.onnx
    provenode-url: https://provenode-seven.vercel.app
    region: Asia-Pacific
    canary: true
```

---

## Move contract (Shelbynet)

`contract/sources/ModelRegistry.move` — deploys to Shelbynet and keeps an on-chain registry of every registered model. Anyone can query it directly without going through the API.

```bash
aptos init --network custom --rest-url https://api.shelbynet.shelby.xyz/v1
aptos account fund-with-faucet --account default
aptos move publish --named-addresses provenode_addr=default
aptos move run --function-id 'default::ModelRegistry::initialize'
```

Verify any model hash from anywhere:

```bash
aptos move view \
  --function-id '<ADDRESS>::ModelRegistry::verify_model' \
  --args "address:<ADDRESS>" "hex:<sha256_hex>"
```

---

## Project structure

```
src/                 React + TypeScript frontend (Vite build)
  pages/             18 console pages + Login + Landing + Verify
  components/        Layout (sidebar, topbar)
  lib/               API client, utilities
  styles/            app.css, landing.css, auth.css
api/
  index.js           Single serverless function handles all /api/* routes
  lib/               kv.js, shelby.js, notify.js, audit.js, sign.js, email.js, metadata.js
  crons/             expiry-check.js (daily), tamper-check.js (daily)
contract/
  sources/ModelRegistry.move
sdk/python/          pip install provenode-sdk
.github/actions/deploy-model/   GitHub Action for CI/CD model deployment
```

---

## Cron jobs

Two daily jobs run automatically (Vercel cron):

`/api/crons/expiry-check` runs at 06:00 UTC — scans all Shelby objects and fires a webhook / email for anything expiring within 7 days.

`/api/crons/tamper-check` runs at 18:00 UTC — spot-checks a random sample of Shelby objects against their KV records and quarantines anything that fails.

Both require the `Authorization: Bearer <CRON_SECRET>` header (Vercel injects this automatically).

---

## Local development

```bash
npm install
cp .env.example .env.local
# fill in SHELBY_NETWORK=shelbynet and any optional keys
npm run dev       # Vite dev server + Vercel function emulation
```

---

## Shelby SDK peer dependency

`@aptos-labs/ts-sdk` must stay at `^6.0.0`. The `^7.x` range breaks `@shelby-protocol/sdk` peer resolution. The `package.json` `overrides` field enforces this.
