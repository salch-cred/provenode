# ModelRelay — zero-cost Intel Core i3 deployment

This edition uses **Cloudflare Pages only**. It requires no Docker, VM, database, or paid server. The Intel Core i3 computer only uploads small static files; Cloudflare performs the hosting.

## Design system

- Clay-inspired editorial landing-page composition
- Warm paper canvas, black keylines, offset shadows, coral actions, spreadsheet-style product visuals
- Matching operations console, model registry, fleet screens, and Shelby proof screens
- Official Hugeicons free stroke-rounded icon font loaded from `cdn.hugeicons.com`
- Original ModelRelay layout and content; no Clay logos, copy, or proprietary assets are included

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
- `/app.html` — ModelRelay console
- `/console` — friendly redirect to the console
- `/api/health` — Cloudflare Pages health function
- `/api/config` — safe public configuration; never returns credentials

## Shelby limitation

This zero-cost package runs the complete interactive demo and hashes uploaded files in the browser. It does **not** perform real Shelby uploads yet because a Shelby Early Access key and a tested server-side SDK adapter are required.

When credentials are available, store them as a Cloudflare secret—not as a public environment variable and never in `app.html`:

```bash
npx wrangler pages secret put SHELBY_API_KEY --project-name modelrelay
```

Before real model uploads, verify that the current Shelby Node SDK and its required Aptos dependencies run in Cloudflare's Workers runtime with Node compatibility. If they do not, real uploads will need a separate trusted Node backend, which may not remain zero-cost. The deployed demo itself remains zero-cost.

## Resource requirements

- Local CPU: minimal; no compilation when using GitHub integration
- Local RAM: a browser and Git client are sufficient
- Storage: under 1 MB for this project
- Docker: not required
- Database: not required
- Paid domain: not required
