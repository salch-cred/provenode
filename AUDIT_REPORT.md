# Provenode — Full Code Audit & Vercel Migration Report

**Repo:** https://github.com/salch-cred/provenode  
**Audited:** 2026-08-02  
**Stack:** Cloudflare Pages + Pages Functions → Vercel Serverless + Vercel KV  

---

## 1. Project Summary

Provenode is a zero-cost AI model deployment dashboard built on top of the **Shelby Protocol** testnet (Aptos-based decentralized object storage). Users upload model files, get SHA-256 hashes, and optionally publish them as verifiable on-chain objects. A deployment console tracks rollout progress across 248 edge devices.

**Architecture (original):**
```
public/           ← Cloudflare Pages static output directory
  index.html      ← Marketing landing page
  app.html        ← Dashboard SPA (inline JS, ~4 000 lines)
  verify.html     ← Public proof page (query-param driven)
  _headers        ← Cloudflare security headers
  _redirects      ← /console → /app.html
functions/api/    ← Cloudflare Pages Functions (Worker)
  upload.js       ← POST /api/upload
  deploy.js       ← POST /api/deploy
  models.js       ← GET  /api/models
  status.js       ← GET|POST /api/status
  health.js       ← GET /api/health
  config.js       ← GET /api/config
  shelby-status.js← GET /api/shelby-status
  manifest/       ← (subfolder — likely [id].js)
```

---

## 2. Issues Found — Severity Levels: 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low

---

### 🔴 CRITICAL

#### C-1: No rate limiting on upload/deploy endpoints
`/api/upload` accepts any file up to 100 MB with no per-IP or per-session rate limit. An attacker can exhaust KV write quotas and Shelby faucet funds with a simple loop.

**Fix:** Add rate limiting middleware using Vercel Edge middleware or an in-memory sliding window checked against the client IP (`x-forwarded-for`).

#### C-2: status.js — unauthenticated POST can manipulate device counts
`POST /api/status` accepts `{ id, status: "verified", count }` from *any* caller with no auth token or HMAC verification. Anyone can drive a deployment to 100% verified without running the dashboard.

**Fix:** Require a shared secret (`X-Provenode-Token` header) or only allow increment POSTs from the deploy flow with a signed deployment token.

#### C-3: `globalThis.Buffer` / `globalThis.process` pollution in Workers
`upload.js` and `deploy.js` both do:
```js
globalThis.Buffer = nodeBuffer.Buffer;
globalThis.process = { env: {} };
```
This mutates shared global scope in a Worker environment where requests share the same isolate. A concurrent request can see another's polluted globals.

**Fix:** Extracted into `api/lib/shelby.js` with a `typeof` guard that only sets globals once and uses local scoping — done in this migration.

---

### 🟠 HIGH

#### H-1: Duplicated Shelby upload logic in upload.js AND deploy.js
Identical `ShelbyClient` / `Account.generate()` / `fundAccountWithAPT` / `fundAccountWithShelbyUSD` / `client.upload()` blocks appear in both files. A bug fix in one won't be applied to the other.

**Fix:** Extracted into `api/lib/shelby.js` (shared helper) in this migration. Both handlers now call `shelbyUpload()`.

#### H-2: `shelby-status.js` reported inverted mode
Original code:
```js
mode: env.SHELBY_API_KEY ? 'demo' : 'production'  // ← INVERTED
```
This tells the UI it's in production mode when no key is configured, and demo mode when a real key is present.

**Fix:** Corrected to `hasKey ? 'production' : 'demo'` in the new `api/shelby-status.js`.

#### H-3: `status.js` GET (no id) crashes when PROVENODE_DB is not bound
The `list()` call on line 1 runs without a null-check:
```js
const list = await env.PROVENODE_DB.list({ prefix: "deployment:" });
```
If the KV binding is missing (e.g. during local dev or misconfigured preview), this throws a `TypeError` that surfaces as a 500 with a stack trace.

**Fix:** Added a null-guard that returns `{ deployments: [] }` when the DB is unavailable — done in the new `api/status.js`.

#### H-4: `models.js` exposes all raw KV record fields
The original `/api/models` response included every field stored in KV, which could include internal metadata or future fields you don't want public.

**Fix:** New `api/models.js` uses a `PUBLIC_FIELDS` allowlist — only `id, model, objectId, sha256, size, mode, createdAt` are returned.

#### H-5: Missing `formidable` / body parser on upload
Cloudflare Pages Functions receive `Request` objects with `.formData()` natively. Vercel Node.js functions need an explicit body parser. The original upload flow would silently fail (`file = null`) on Vercel without `formidable`.

**Fix:** Added `formidable` as a dependency in `api/upload.js` with `export const config = { api: { bodyParser: false } }`.

---

### 🟡 MEDIUM

#### M-1: No MIME-type validation on uploaded files
Any file type is accepted. In production, a user could upload a `.exe`, `.sh`, or `.html` file and get it SHA-256 registered and stored in KV.

**Fix:** Added `ALLOWED_TYPES` set in the new `upload.js` — restricts to octet-stream, zip, tar, gzip, glTF-binary, JSON, and plain text. Extend as needed.

#### M-2: Content-Security-Policy missing `connect-src` for Shelby API
The `_headers` file sets:
```
connect-src 'self'
```
But the frontend must be able to call Shelby's RPC/indexer endpoints. This blocks real Shelby network calls from the browser if any were attempted.

**Fix:** Updated CSP in `vercel.json` to include `https://api.shelby.network https://shelbynet.aptoslabs.com`.

#### M-3: Missing HSTS header
The original `_headers` file has no `Strict-Transport-Security` header, leaving the site vulnerable to SSL-stripping on first visit.

**Fix:** Added `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` in `vercel.json`.

#### M-4: `X-Frame-Options: DENY` missing from original headers
The original CSP has `frame-ancestors 'none'` (correct) but no `X-Frame-Options` fallback for older browsers.

**Fix:** Added `X-Frame-Options: DENY` header in `vercel.json`.

#### M-5: No `X-XSS-Protection` header
**Fix:** Added `X-XSS-Protection: 1; mode=block` in `vercel.json`.

#### M-6: `_redirects` only redirects `/console` — no 404 page
**Fix:** Add a `404.html` to `public/` to provide a branded 404 experience instead of Cloudflare/Vercel's default.

#### M-7: `app.html` file is ~4 000 lines of inline JS
The entire dashboard is one HTML file with all JS and CSS inline. This makes it impossible to tree-shake, test, or maintain. Cache busting is also broken (any change invalidates the whole HTML document instead of just the changed JS/CSS bundle).

**Recommendation:** Split into `app.js` + `app.css` as separate files, imported via `<script src="app.js">` and `<link rel="stylesheet" href="app.css">`. This enables long-term caching (`immutable`) on the static assets.

---

### 🟢 LOW

#### L-1: `package.json` scripts use `wrangler` — not needed for Vercel
`"dev": "wrangler pages dev ..."` and `"deploy": "wrangler pages deploy ..."` are Cloudflare-specific. Updated to `vercel dev` / `vercel --prod`.

#### L-2: `health.json` static file is redundant with `/api/health`
`public/health.json` always shows stale data. Remove it and rely solely on the dynamic `/api/health` endpoint.

#### L-3: `brag-output-2026-07-14/` folder committed to main branch
A temporary brag/test output directory is in the repo root and will be deployed. Should be in `.gitignore` or deleted.

#### L-4: `provenode-agent.py` in `public/` directory
A Python agent script is served as a static file — probably unintentional. It's accessible publicly as `https://your-domain/provenode-agent.py`. Move to a non-public directory if it contains internal logic.

#### L-5: `@aptos-labs/ts-sdk` version comment only in README
The peer-dependency constraint (`^5.2.1 || ^6.0.0`, don't bump to ^7.x) is documented in README but not enforced. Add an `.npmrc` or explicit `overrides` entry to prevent accidental bumps.

---

## 3. Vercel Migration Guide

### Step 1 — Connect Vercel KV

```bash
# In your Vercel project dashboard:
# Storage → Create → KV Store → connect to project
# This injects: KV_URL, KV_REST_API_URL, KV_REST_API_TOKEN, KV_REST_API_READ_ONLY_TOKEN
```

### Step 2 — Set environment variables

In the Vercel dashboard → Settings → Environment Variables:

| Variable | Value | Environments |
|---|---|---|
| `SHELBY_API_KEY` | Your key from shelby.network | Production only |
| `SHELBY_NETWORK` | `testnet` | All |
| `SHELBY_MODE` | `demo` (or `shelby` if key set) | All |
| `ALLOWED_ORIGIN` | `https://provenode.vercel.app` | Production |

### Step 3 — Install new dependency

```bash
npm install formidable @vercel/kv
```

### Step 4 — Deploy

```bash
# One-time setup
npx vercel link

# Deploy to production
npx vercel --prod

# Or via GitHub Actions (see .github/workflows/deploy.yml)
```

### Step 5 — Add GitHub Actions secrets

In your GitHub repo → Settings → Secrets and variables → Actions:
- `VERCEL_TOKEN` — from vercel.com/account/tokens
- `VERCEL_ORG_ID` — from `.vercel/project.json` after `vercel link`
- `VERCEL_PROJECT_ID` — from `.vercel/project.json` after `vercel link`

---

## 4. Strengthening for Production Shelby Use

### Rate Limiting (add to vercel.json or middleware.js)

```js
// middleware.js (Vercel Edge Middleware)
import { NextResponse } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { kv } from '@vercel/kv'

const ratelimit = new Ratelimit({
  redis: kv,
  limiter: Ratelimit.slidingWindow(10, '60s'), // 10 req/min per IP
})

export async function middleware(request) {
  const ip = request.headers.get('x-forwarded-for') ?? '127.0.0.1'
  const { success } = await ratelimit.limit(ip)
  if (!success) return new NextResponse('Too Many Requests', { status: 429 })
  return NextResponse.next()
}

export const config = {
  matcher: ['/api/upload', '/api/deploy'],
}
```

### Deploy Auth Token (protect POST /api/status)

```js
// In api/status.js POST handler
const token = req.headers['x-provenode-token']
if (token !== process.env.DEPLOY_SECRET) {
  return res.status(401).json({ error: 'Unauthorized.' })
}
```

### Persistent Shelby Account (don't generate ephemeral keys every request)

Instead of `Account.generate()` per request, store a persistent private key:
```bash
# Generate once
node -e "const { Account } = require('@aptos-labs/ts-sdk'); console.log(Account.generate().privateKey.toString())"
# Store in SHELBY_PRIVATE_KEY env var
# Load with: Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(process.env.SHELBY_PRIVATE_KEY) })
```
This avoids faucet calls on every upload and makes uploads faster.

---

## 5. File Inventory

### New files added in this migration

| File | Purpose |
|---|---|
| `vercel.json` | Vercel routing, headers, function config |
| `api/lib/kv.js` | Vercel KV adapter (matches CF KV interface) |
| `api/lib/shelby.js` | Shared Shelby upload helper (DRY) |
| `api/upload.js` | POST /api/upload (Vercel) |
| `api/deploy.js` | POST /api/deploy (Vercel) |
| `api/models.js` | GET /api/models (Vercel) |
| `api/status.js` | GET|POST /api/status (Vercel) |
| `api/health.js` | GET /api/health (Vercel) |
| `api/config.js` | GET /api/config (Vercel) |
| `api/shelby-status.js` | GET /api/shelby-status (Vercel, bug fixed) |
| `.github/workflows/deploy.yml` | GitHub Actions CI/CD |
| `.env.example` | All required env vars documented |
| `.gitignore` | Prevents secrets/build artifacts |

### Files to copy from original repo (unchanged)

| File | Notes |
|---|---|
| `public/index.html` | Marketing landing page |
| `public/app.html` | Dashboard SPA |
| `public/verify.html` | Proof page |
| `public/provenode-logo.svg` | Logo |
| `public/provenode-edge-network-512.png` | OG image |

### Files to delete / not copy

| File | Reason |
|---|---|
| `public/_headers` | Replaced by `vercel.json` headers |
| `public/_redirects` | Replaced by `vercel.json` routes |
| `public/health.json` | Replaced by `/api/health` |
| `brag-output-2026-07-14/` | Temporary test output, not for production |
| `functions/` | Entire directory — replaced by `api/` |
| `wrangler.toml` | Cloudflare-specific, not needed |

---

## 6. Quick Security Scorecard

| Check | Before | After |
|---|---|---|
| Rate limiting on uploads | ❌ None | 🟡 Needs middleware.js |
| Status POST auth | ❌ None | 🟡 Needs DEPLOY_SECRET |
| HSTS | ❌ Missing | ✅ Added |
| X-Frame-Options | ❌ Missing | ✅ Added |
| X-XSS-Protection | ❌ Missing | ✅ Added |
| CSP connect-src for Shelby | ❌ Blocked | ✅ Fixed |
| Inverted shelby-status mode | 🔴 Bug | ✅ Fixed |
| globalThis pollution | 🔴 Bug | ✅ Fixed |
| Duplicated Shelby logic | 🟠 DRY violation | ✅ Extracted |
| Public field exposure in /models | 🟠 Over-exposed | ✅ Allowlist |
| MIME validation | ❌ None | ✅ Added |
| Secrets in env, not code | ✅ Already correct | ✅ |
| .gitignore | ❌ Missing | ✅ Added |
