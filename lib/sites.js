/**
 * Shelby Sites — static website hosting on Shelby blob storage
 * Each site is a KV record + N Shelby blobs (one per file + manifest)
 * Deployment = immutable snapshot, like Vercel/Netlify. Preview = per-deployment URL.
 */

export function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || `site-${Math.random().toString(36).slice(2, 6)}`;
}

export function validateSlug(slug) {
  return /^[a-z0-9][a-z0-9-]{2,48}$/.test(slug);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
  '.map': 'application/json; charset=utf-8',
};

export function contentTypeFor(path) {
  const dot = path.lastIndexOf('.');
  const ext = dot >= 0 ? path.slice(dot).toLowerCase() : '';
  return MIME[ext] || 'application/octet-stream';
}

export function normalizeSitePath(p) {
  // prevent traversal, normalize index handling
  let s = String(p || '').replace(/\\/g, '/').replace(/^\/+/, '');
  s = s.replace(/\/{2,}/g, '/');
  if (s.includes('..')) s = s.replace(/\.\.+/g, '');
  if (!s || s === '/') return 'index.html';
  if (s.endsWith('/')) return s + 'index.html';
  // extensionless -> try .html fallback handled in resolver, keep as-is for lookup
  return s;
}

export function buildSiteRecord({ name, slug, description, framework, owner }) {
  const now = new Date().toISOString();
  return {
    id: `site_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`,
    slug,
    name: name?.slice(0, 120) || slug,
    description: description?.slice(0, 500) || '',
    framework: framework || 'static',
    owner: owner || null,
    createdAt: now,
    updatedAt: now,
    deploymentCount: 0,
    lastDeploymentId: null,
    status: 'ready',
  };
}

export function buildDeploymentRecord({ siteId, siteSlug, files, entryPath }) {
  const now = new Date().toISOString();
  const totalBytes = files.reduce((a, f) => a + (f.size || 0), 0);
  return {
    id: `dep_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`,
    siteId,
    siteSlug,
    files, // [{ path, size, sha256, blobName, objectId }]
    entryPath: entryPath || 'index.html',
    fileCount: files.length,
    totalBytes,
    createdAt: now,
    status: 'ready',
    urlPath: `/s/${siteSlug}`,
    previewPath: `/s/${siteSlug}/_deploy/${Date.now().toString(36)}`,
  };
}

export function siteBlobName(siteSlug, deploymentId, filePath) {
  const safePath = filePath.replace(/^\/+/, '').replace(/[^a-zA-Z0-9._\-\/]/g, '-');
  return `sites/${siteSlug}/${deploymentId}/${safePath}`;
}

export function manifestBlobName(siteSlug, deploymentId) {
  return `sites/${siteSlug}/${deploymentId}/__manifest.json`;
}
