# Provenode — Vercel Setup Guide (Step-by-Step)

## Prerequisites
- GitHub account (repo: salch-cred/provenode)
- Vercel account (free tier works)
- Node.js 20+

---

## Step 1 — Add these files to your repo

Copy everything from this package into your repository root, maintaining the folder structure:

```
your-repo/
├── api/
│   ├── lib/
│   │   ├── kv.js          ← NEW (Vercel KV adapter)
│   │   └── shelby.js      ← NEW (shared Shelby helper)
│   ├── upload.js          ← REPLACE functions/api/upload.js
│   ├── deploy.js          ← REPLACE functions/api/deploy.js
│   ├── models.js          ← REPLACE functions/api/models.js
│   ├── status.js          ← REPLACE functions/api/status.js
│   ├── health.js          ← REPLACE functions/api/health.js
│   ├── config.js          ← REPLACE functions/api/config.js
│   └── shelby-status.js   ← REPLACE (bug fix: inverted mode)
├── public/                ← KEEP existing files as-is
│   ├── index.html
│   ├── app.html
│   ├── verify.html
│   └── provenode-logo.svg
├── .github/
│   └── workflows/
│       └── deploy.yml     ← NEW (CI/CD)
├── vercel.json            ← NEW (replaces _headers + _redirects)
├── package.json           ← REPLACE
├── .env.example           ← NEW
└── .gitignore             ← NEW
```

**Delete from repo:**
- `functions/` directory (entire)
- `public/_headers`
- `public/_redirects`
- `public/health.json`
- `wrangler.toml` (if present)
- `brag-output-2026-07-14/` directory

---

## Step 2 — Install Vercel KV

1. Go to your Vercel project dashboard
2. Click **Storage** → **Create Database** → **KV**
3. Give it a name (e.g. `provenode-kv`)
4. Click **Connect to Project** → select your project → confirm
5. Vercel automatically injects `KV_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN` into your project

---

## Step 3 — Set Environment Variables in Vercel

Go to **Settings → Environment Variables** and add:

| Name | Value | Scope |
|---|---|---|
| `SHELBY_NETWORK` | `shelbynet` (real network; `testnet` to opt out) | All |
| `SHELBY_MODE` | `shelby` (real mode only — demo mode removed) | All |
| `SHELBY_API_KEY` | *(your real key from shelby.network)* | Production only |
| `ALLOWED_ORIGIN` | `https://provenode.vercel.app` | Production |

> ⚠️ `SHELBY_API_KEY` should ONLY be added to the **Production** environment, not Preview/Development.

---

## Step 4 — Link Vercel to GitHub

1. Go to Vercel → **Add New Project**
2. Import your GitHub repository
3. Set:
   - **Framework Preset:** Other
   - **Build Command:** *(leave blank)*
   - **Output Directory:** `public`
   - **Install Command:** `npm install`
4. Click **Deploy**

Every `git push` to `main` will now auto-deploy to production.
Every Pull Request gets a unique preview URL.

---

## Step 5 — Add GitHub Actions Secrets (for CI/CD)

In your GitHub repo → **Settings → Secrets and variables → Actions**:

1. `VERCEL_TOKEN` — get from https://vercel.com/account/tokens
2. `VERCEL_ORG_ID` — run `cat .vercel/project.json` after `npx vercel link`
3. `VERCEL_PROJECT_ID` — same file

---

## Step 6 — Local Development

```bash
# Install dependencies
npm install

# Copy .env.example to .env.local and fill in values
cp .env.example .env.local

# Run local dev server (Vercel emulates serverless functions)
npm run dev
# → http://localhost:3000
```

---

## Step 7 — Verify Everything Works

```bash
# Health check
curl https://your-project.vercel.app/api/health

# Shelby status
curl https://your-project.vercel.app/api/shelby-status

# Config
curl https://your-project.vercel.app/api/config

# Upload a test model (demo mode)
curl -X POST https://your-project.vercel.app/api/upload \
  -F "file=@/path/to/model.bin" \
  -F "name=test-model"
```

---

## Troubleshooting

**Q: `/api/upload` returns 500 with "formidable" error**
→ Make sure `export const config = { api: { bodyParser: false } }` is in `upload.js` ✅

**Q: KV reads return `null` after writing**
→ Vercel KV can have up to ~100ms eventual consistency. Add a small delay if reading immediately after writing.

**Q: Shelby upload returns demo mode even with API key set**
→ Check `SHELBY_API_KEY` is set in **Production** environment (not just Development).
→ Test: `curl /api/shelby-status` — should return `"mode": "production"` and `"connected": true`.

**Q: `npm install` fails with peer dependency conflict**
→ The `overrides` in `package.json` pins `@aptos-labs/ts-sdk` to `^6.0.0`. Do NOT upgrade it to `^7.x`.
