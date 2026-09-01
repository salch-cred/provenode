---
sidebar_position: 6
id: sites
slug: /sites
---

# Shelby Sites — Static Website Hosting

Deploy static websites to **immutable Shelby blobs** — a Vercel-like deploy flow on decentralized storage. Every file in your ZIP becomes a content-addressed blob on Shelbynet, served at a public URL with full SHA-256 verification.

## Quick Start

```bash
# 1. Create a site
curl -X POST https://your-app.vercel.app/api/sites \
  -H "Content-Type: application/json" \
  -H "X-Provenode-Token: $TOKEN" \
  -d '{"name": "My Portfolio", "slug": "my-portfolio"}'

# 2. Zip your static build and deploy
zip -r site.zip dist/
curl -X POST https://your-app.vercel.app/api/sites/$SITE_ID/deploy \
  -H "X-Provenode-Token: $TOKEN" \
  -F file=@site.zip

# 3. Visit your site
open https://your-app.vercel.app/s/my-portfolio
```

## How It Works

```
ZIP upload ──▶ unpack + MIME sniff ──▶ per-file SHA-256
     │                                      │
     ▼                                      ▼
 Shelby blob per file           manifest blob (__manifest.json)
 sites/<slug>/<depId>/<path>     sites/<slug>/<depId>/__manifest.json
```

1. **Upload** — POST a ZIP (or single HTML file) to `/api/sites/:id/deploy`
2. **Unpack** — the server extracts entries, skips junk (`__MACOSX/`, `.DS_Store`), and sniffs MIME types per extension
3. **Store** — each file is uploaded as an immutable Shelby blob at `sites/<slug>/<deploymentId>/<path>`; a `__manifest.json` blob records every file's path, size, SHA-256, and objectId
4. **Serve** — `/s/:slug/*` resolves the latest deployment's manifest, fetches the blob from Shelby, and streams it with the correct `Content-Type` and a 60s edge cache
5. **SPA fallback** — unknown paths fall back to `path.html`, then `path/index.html`, then `index.html`

Each deployment is an **immutable snapshot** — like a Vercel preview. Redeploy to the same slug to update the public URL.

## API Reference

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/sites` | List all sites |
| `POST` | `/api/sites` | Create site `{ name, slug?, description?, framework? }` |
| `GET` | `/api/sites/:idOrSlug` | Get site + deployment history |
| `DELETE` | `/api/sites/:idOrSlug` | Delete site + all deployments |
| `POST` | `/api/sites/:id/deploy` | Deploy ZIP / HTML / JSON files |
| `GET` | `/api/sites/:id/deployments` | List deployments |
| `GET` | `/api/sites/:id/serve/<path>` | Serve latest deployment file |
| `GET` | `/api/sites/:id/preview/:depId/<path>` | Preview a specific deployment |

### Deploy Request Formats

**Multipart ZIP** (recommended):
```
-F file=@site.zip            # ZIP containing index.html at root
-F entry=index.html          # optional entry override
```

**Single HTML file:**
```
-F file=@index.html          # becomes index.html automatically
```

**JSON body:**
```json
{
  "html": "<h1>Hello</h1>"
}
```
or
```json
{
  "files": [
    { "path": "index.html",    "contentBase64": "..." },
    { "path": "assets/app.js", "contentBase64": "..." }
  ]
}
```

## Limits

| Limit | Value |
|-------|-------|
| Upload size (ZIP) | 50 MB |
| Total per deployment | 40 MB |
| Files per deployment | 200 |
| Max single file | 10 MB |
| Blob lifetime | 90 days (auto-renewed by cron) |

## Verification

Every deployment manifest is itself a Shelby blob. To audit a live site:

```bash
# Fetch the manifest from Shelby
curl "$SHELBY_RPC/shelby/v1/blobs/$ADDRESS/sites/my-portfolio/$DEP_ID/__manifest.json"

# Check any served file against its recorded SHA-256
curl -s https://your-app.vercel.app/s/my-portfolio/app.js | sha256sum
```

A hash mismatch between served content and the manifest means the site was tampered with — this is impossible on traditional CDNs where the origin can be silently edited.

## Frameworks

| Framework | Build command | ZIP root |
|-----------|--------------|----------|
| Vite | `vite build` | `dist/` |
| Next.js | `next build` (static export) | `out/` |
| Astro | `astro build` | `dist/` |
| CRA | `npm run build` | `build/` |
| Plain HTML | — | `.` |

## Console

The **Sites** page in the console (`/app/sites`) provides:
- Site creation with automatic slug preview
- Drag-and-drop ZIP deployment
- Deployment history with file counts and sizes
- Inline iframe preview of the live site
- Copyable public URLs

## FAQ

**Is this a Neon replacement?**
No. Shelby is blob storage, not Postgres. Use Shelby Sites for your frontend and immutable assets; pair it with Neon/Upstash for mutable state.

**What happens after 90 days?**
The expiry cron re-anchors manifests before expiry and emails a warning 7 days ahead. Sites with traffic renew automatically.

**Custom domains?**
Roadmap — a CNAME-based gateway with automatic TLS is planned. Today every site lives at `/s/<slug>`.
