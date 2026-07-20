# Provenode — zero-cost Intel Core i3 deployment

This edition uses **Cloudflare Pages only**. It requires no Docker, VM, database, or paid server. The Intel Core i3 computer only uploads small static files; Cloudflare performs the hosting.

## Design system

- Clay-inspired editorial landing-page composition
- Warm paper canvas, black keylines, offset shadows, coral actions, spreadsheet-style product visuals
- Matching operations console, model registry, fleet screens, and Shelby proof screens
- Official Hugeicons free stroke-rounded icon font loaded from `cdn.hugeicons.com`
- Original Provenode layout and content; no Clay logos, copy, or proprietary assets are included

## Why this method

- No-cost Pages plan for a hackathon/demo
- No local build required through GitHub integration
- Works from a low-power Intel Core i3 laptop
- Global CDN and HTTPS included
- Pages Functions provide `/api/health` and `/api/config`
- Secrets can be stored in Cloudflare instead of browser code

## Recommended deployment: GitHub + Cloudflare dashboard

This uses the least CPU and memory on the i3 device.

1. Create a free GitHub repository.
2. Upload this folder and commit it to the `main` branch.
3. Create a free Cloudflare account.
4. Open **Workers & Pages → Create → Pages → Connect to Git**.
5. Select the GitHub repository.
6. Use these settings:
   - Framework preset: **None**
   - Production branch: `main`
   - Build command: leave empty
   - Build output directory: `public`
   - Root directory: leave empty
7. Add environment variables:
   - `SHELBY_MODE=demo`
   - `SHELBY_NETWORK=testnet`
8. Click **Save and Deploy**.

Cloudflare supplies a free `pages.dev` URL. Future GitHub commits deploy automatically.

## Alternative: deploy from the i3 terminal

Install Node.js 20 or newer, then:

```bash
npm install
npx wrangler login
npm run deploy
```

Local preview:

```bash
npm run dev
```

## Routes

- `/` — landing page
- `/app.html` — Provenode console
- `/console` — friendly redirect to the console
- `/api/health` — Cloudflare Pages health function
- `/api/config` — safe public configuration; never returns credentials
- `/api/upload` — hashes an uploaded model (SHA-256) and registers it in the KV-backed model registry; performs a real Shelby testnet upload once `SHELBY_API_KEY` is configured, falling back to demo mode if the Shelby call fails
- `/api/deploy` — same real-vs-demo behavior as `/api/upload`, for the rollout/deployment flow
- `/api/models` — lists previously registered models so the console survives page reloads
- `/verify.html` — public proof page for a registered model, e.g. `/verify.html?id=...&name=...&hash=...`

## Shelby integration

Without `SHELBY_API_KEY` configured, `/api/upload` and `/api/deploy` run in demo mode: files are hashed with real SHA-256 in the Worker and registered in Cloudflare KV, but no on-chain object is created.

With `SHELBY_API_KEY` configured, both endpoints perform a real upload to Shelby's `shelbynet` testnet using `@shelby-protocol/sdk` and `@aptos-labs/ts-sdk` (Cloudflare Pages Functions, `nodejs_compat` enabled): they generate an ephemeral Aptos signer, fund it with APT and ShelbyUSD via the SDK's own faucet helpers, then call `client.upload()`. If the real upload fails for any reason (bad key, faucet outage, network issue), the request degrades gracefully to a demo-mode registration instead of failing outright, and the response includes a `warning` field explaining what happened.

Store the key as a Cloudflare secret — not as a public environment variable and never in `app.html`:

```bash
npx wrangler pages secret put SHELBY_API_KEY --project-name provenode-app
```

The Shelby SDK's peer dependency requires `@aptos-labs/ts-sdk@^5.2.1 || ^6.0.0` — do not bump it to `^7.x`, `npm install` will fail with a peer dependency conflict.

## Resource requirements

- Local CPU: minimal; no compilation when using GitHub integration
- Local RAM: a browser and Git client are sufficient
- Storage: under 1 MB for this project
- Docker: not required
- Database: not required
- Paid domain: not required
