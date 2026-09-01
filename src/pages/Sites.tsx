import React, { useEffect, useState, useRef } from 'react';
import { get, post, del, upload } from '../lib/api';
import { useToast } from '../contexts/AppContext';

type Site = {
  id: string; slug: string; name: string; description: string;
  framework: string; createdAt: string; updatedAt: string;
  deploymentCount: number; lastDeploymentId: string | null;
  rollbackHistory?: { from: string | null; to: string; at: string }[];
};

type Deployment = {
  id: string; siteId: string; siteSlug: string;
  fileCount: number; totalBytes: number; createdAt: string;
  entryPath: string; manifestObjectId: string;
};

type SiteKey = { siteId: string; siteSlug: string; createdAt: string; label: string; token: string };

const BUILD_CMDS: Record<string, string> = {
  vite: 'npm ci && npm run build',
  'next-static': 'npm ci && npm run build',
  astro: 'npm ci && npm run build',
  other: 'npm ci && npm run build --if-present',
};

function workflowYaml({ siteId, origin, buildCmd }: { siteId: string; origin: string; buildCmd: string }) {
  return `# Provenode — push-to-deploy to Shelby Sites
# Commits to main deploy to production (/s/your-slug).
# Pull requests deploy an immutable preview and comment the URL.
name: Deploy to Provenode

on:
  push:
    branches: [main]
  pull_request:

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write   # lets the PR job comment the preview URL
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Build
        run: ${buildCmd}

      - name: Package
        run: zip -r site.zip . -x "site.zip"   # zips the build output in place

      - name: Deploy to Provenode
        env:
          PROVENODE_KEY: \${{ secrets.PROVENODE_DEPLOY_KEY }}
        run: |
          curl -sf -X POST "${origin}/api/sites/${siteId}/deploy" \\
            -H "Authorization: Bearer $PROVENODE_KEY" \\
            -F file=@site.zip \\
            -o deploy_result.json
          cat deploy_result.json

      - name: Comment preview URL on PR
        if: github.event_name == 'pull_request'
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: |
          URL=$(node -e "console.log(JSON.parse(require('fs').readFileSync('deploy_result.json')).previewUrl)")
          gh pr comment "$PR_NUMBER" --body "Shelby preview: ${origin}$URL"
        # Note: package your build output folder, not repo root.
        # If your build outputs to dist/, cd dist && zip -r ../site.zip . first.`;
}

export default function Sites() {
  const toast = useToast();
  const [sites, setSites] = useState<Site[]>([]);
  const [deployments, setDeployments] = useState<Record<string, Deployment[]>>({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '', description: '', framework: 'static' });
  const [deployingId, setDeployingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ site: Site; deployment: Deployment } | null>(null);
  const [gitPanel, setGitPanel] = useState<string | null>(null);
  const [siteKeys, setSiteKeys] = useState<Record<string, SiteKey[]>>({});
  const [newKey, setNewKey] = useState<string | null>(null);
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const [origin] = useState(typeof window !== 'undefined' ? window.location.origin : '');

  const loadKeys = async (siteId: string) => {
    try {
      const d = await get<any>(`/api/sites/${siteId}/keys`);
      setSiteKeys(prev => ({ ...prev, [siteId]: d.keys || [] }));
    } catch { /* dev-open mode may reject; ignore */ }
  };

  const createKey = async (siteId: string) => {
    try {
      const d = await post<any>(`/api/sites/${siteId}/keys`, {});
      setNewKey(d.token);
      loadKeys(siteId);
      toast('Deploy key created — copy it into GitHub secrets now', 'success');
    } catch (e: any) { toast(e.message, 'error'); }
  };

  const revokeKey = async (siteId: string, maskedToken: string) => {
    if (!confirm('Revoke this deploy key? CI deploys using it will fail.')) return;
    try {
      await del(`/api/sites/${siteId}/keys/${encodeURIComponent(maskedToken)}`);
      toast('Key revoked', 'info');
      loadKeys(siteId);
    } catch (e: any) { toast(e.message, 'error'); }
  };

  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); toast(`${what} copied`, 'success'); }
    catch { toast('Copy failed — select manually', 'error'); }
  };

  const rollback = async (siteId: string, deploymentId: string) => {
    if (!confirm('Promote this deployment to production? The blobs are already on Shelby — this only moves the production pointer, so it is instant and reversible.')) return;
    setRollingBack(deploymentId);
    try {
      const r = await post<any>(`/api/sites/${siteId}/rollback`, { deploymentId });
      toast(r.message || 'Rolled back', 'success');
      await load();
    } catch (e: any) { toast(e.message, 'error'); }
    setRollingBack(null);
  };
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const d = await get<any>('/api/sites');
      setSites(d.sites || []);
      // preload deployments for each site
      for (const s of d.sites || []) {
        try {
          const dd = await get<any>(`/api/sites/${s.id}/deployments`);
          setDeployments(prev => ({ ...prev, [s.id]: dd.deployments || [] }));
        } catch {}
      }
    } catch (e: any) { /* empty state */ }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const slugPreview = form.slug || form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);

  const createSite = async () => {
    if (!form.name.trim()) return toast('Site name required', 'error');
    setCreating(true);
    try {
      await post('/api/sites', { name: form.name, slug: form.slug || undefined, description: form.description, framework: form.framework });
      toast('Site created — now deploy your files', 'success');
      setForm({ name: '', slug: '', description: '', framework: 'static' });
      load();
    } catch (e: any) { toast(e.message, 'error'); }
    setCreating(false);
  };

  const removeSite = async (id: string) => {
    if (!confirm('Delete this site and all deployments?')) return;
    try { await del(`/api/sites/${id}`); toast('Site deleted', 'info'); load(); } catch (e: any) { toast(e.message, 'error'); }
  };

  const doDeploy = async (siteId: string, file: File) => {
    setDeployingId(siteId);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await upload<any>(`/api/sites/${siteId}/deploy`, fd);
      toast(`Deployed ${res.deployment.fileCount} files to /s/${res.deployment.siteSlug}`, 'success');
      const updated = await get<any>(`/api/sites/${siteId}`);
      // refresh
      load();
      setPreview({ site: updated.site, deployment: res.deployment });
    } catch (e: any) { toast(e.message, 'error'); }
    setDeployingId(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const onFile = (siteId: string, f: File | null) => { if (f) doDeploy(siteId, f); };

  if (loading) return <div className="page"><div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}><div className="spin" style={{ margin: '0 auto 12px' }} />Loading Shelby Sites…</div></div>;

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Hero explainer — SaaS comparison */}
      <div className="card" style={{ overflow: 'hidden', background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 55%, #1e1a12 100%)', color: '#f5f5f0', border: 'none' }}>
        <div className="sites-hero-grid" style={{ padding: '28px 28px 22px', display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 24, alignItems: 'center' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(232,90,40,0.15)', border: '1px solid rgba(232,90,40,0.3)', borderRadius: 9999, padding: '4px 10px', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#ff8a5c' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff6b3d', display: 'inline-block' }} /> NEW · Shelby Sites
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.15, margin: '14px 0 10px' }}>Deploy websites to <span style={{ color: '#ff8a5c' }}>Shelby</span> — like Vercel, but decentralized.</h1>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: '#a8a29a', maxWidth: 560 }}>Upload a ZIP or single HTML file. Every asset becomes an immutable Shelby blob at <span style={{ fontFamily: 'var(--font-mono)', color: '#f5f5f0' }}>sites/&lt;slug&gt;/&lt;deployment&gt;/&lt;path&gt;</span>. Instant preview at <span style={{ fontFamily: 'var(--font-mono)', color: '#f5f5f0' }}>/s/your-site</span> — no servers, no S3 keys to leak, 90-day anchored on Shelbynet with renewal.</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              <span className="badge" style={{ background: 'rgba(255,255,255,0.08)', color: '#f5f5f0', border: '1px solid rgba(255,255,255,0.12)' }}><i className="hgi-stroke hgi-shield-01" /> Immutable blobs</span>
              <span className="badge" style={{ background: 'rgba(255,255,255,0.08)', color: '#f5f5f0', border: '1px solid rgba(255,255,255,0.12)' }}><i className="hgi-stroke hgi-globe-02" /> Edge-served</span>
              <span className="badge" style={{ background: 'rgba(255,255,255,0.08)', color: '#f5f5f0', border: '1px solid rgba(255,255,255,0.12)' }}><i className="hgi-stroke hgi-clock-01" /> 60s cache</span>
            </div>
          </div>
          <div className="card" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(12px)', padding: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#a8a29a', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><i className="hgi-stroke hgi-audit-01" /> Shelby Sites vs Others</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px', gap: 6, fontSize: 12 }}>
              <div style={{ color: '#7a7672', padding: '6px 0' }} />
              <div style={{ textAlign: 'center', fontWeight: 700, color: '#ff8a5c' }}>Shelby</div>
              <div style={{ textAlign: 'center', color: '#7a7672' }}>Neon / Vercel</div>
              {[
                ['Storage', 'Blobs (Aptos)', 'S3 / Postgres'],
                ['Immutability', '✓ content-hash', '— mutable'],
                ['Expiry', '90d renewable', 'Permanent'],
                ['Deploy', 'ZIP → blobs', 'git push'],
                ['Cost model', 'ShelbyUSD micro', 'Seat / usage'],
              ].map(([k, a, b]) => (
                <React.Fragment key={k}>
                  <div style={{ padding: '7px 0', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#d6d2cc' }}>{k}</div>
                  <div style={{ padding: '7px 0', borderTop: '1px solid rgba(255,255,255,0.06)', textAlign: 'center', color: '#f5f5f0', fontWeight: 600 }}>{a}</div>
                  <div style={{ padding: '7px 0', borderTop: '1px solid rgba(255,255,255,0.06)', textAlign: 'center', color: '#7a7672' }}>{b}</div>
                </React.Fragment>
              ))}
            </div>
            <div style={{ marginTop: 12, fontSize: 11, color: '#7a7672', lineHeight: 1.5 }}>Neon = serverless Postgres. Shelby Sites = decentralized static hosting (HTML/CSS/JS/images). Pair them: Shelby for assets, Neon for DB.</div>
          </div>
        </div>
      </div>

      {/* Create site */}
      <div className="card">
        <div className="card-header">
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><i className="hgi-stroke hgi-globe-02" /> Create site</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sites.length} site{sites.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }} className="sites-form-grid">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Site name *</label>
              <input className="form-input" placeholder="My Portfolio" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Public URL: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>/s/{slugPreview || 'your-site'}</span></div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Slug (auto from name)</label>
              <input className="form-input mono" placeholder="my-portfolio" value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 14, marginTop: 14 }} className="sites-form-grid2">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Description</label>
              <input className="form-input" placeholder="Personal site — built with Provenode" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Framework</label>
              <select className="form-input" value={form.framework} onChange={e => setForm({ ...form, framework: e.target.value })}>
                <option value="static">Static</option>
                <option value="vite">Vite</option>
                <option value="next-static">Next.js (static export)</option>
                <option value="astro">Astro</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={createSite} disabled={creating || !form.name.trim()}>
              {creating ? <><span className="spin" /> Creating…</> : <><i className="hgi-stroke hgi-add-01" /> Create site</>}
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>ZIP up to 40MB · 200 files max · auto-index.html fallback</span>
          </div>
        </div>
      </div>

      {/* Site list */}
      {!sites.length ? (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--surface-hover)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
            <i className="hgi-stroke hgi-globe-02" style={{ fontSize: 26, color: 'var(--text-muted)' }} />
          </div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>No sites yet</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 420, margin: '0 auto 16px' }}>Create your first site above, then deploy a ZIP. Like Neon branches, each deploy is an immutable preview — promote by redeploying to the same slug.</div>
          <div className="card" style={{ textAlign: 'left', maxWidth: 560, margin: '0 auto', background: 'var(--bg)', fontFamily: 'var(--font-mono)', fontSize: 12, padding: 14 }}>
            <div style={{ color: 'var(--text-muted)', marginBottom: 6 }}>$ provenode site deploy — quick start</div>
            <div>zip -r site.zip dist/</div>
            <div>curl -X POST -H "X-Provenode-Token: $TOKEN" -F file=@site.zip https://your-app/api/sites/&lt;id&gt;/deploy</div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {sites.map(site => {
            const deps = deployments[site.id] || [];
            const last = deps[0];
            const isDeploying = deployingId === site.id;
            return (
              <div key={site.id} className="card" style={{ overflow: 'hidden' }}>
                <div className="card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--coral)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{site.slug.slice(0, 2).toUpperCase()}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {site.name}
                        <span className="badge badge-demo mono" style={{ fontSize: 10 }}>/s/{site.slug}</span>
                        {site.deploymentCount > 0 && <span className="badge badge-green">{site.deploymentCount} deploy{site.deploymentCount !== 1 ? 's' : ''}</span>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{site.description || 'No description'} · {new Date(site.createdAt).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {last && (
                      <>
                        <a href={`/api/sites/${site.id}/serve/`} target="_blank" rel="noreferrer" className="btn btn-sm btn-primary"><i className="hgi-stroke hgi-link-01" /> Visit /s/{site.slug}</a>
                        <button className="btn btn-sm" onClick={() => setPreview({ site, deployment: last })}><i className="hgi-stroke hgi-view" /> Preview</button>
                      </>
                    )}
                    <button className="btn btn-sm" onClick={() => { const next = gitPanel === site.id ? null : site.id; setGitPanel(next); if (next) loadKeys(site.id); }} title="Push-to-deploy from GitHub">
                      <i className="hgi-stroke hgi-github" /> GitHub
                    </button>
                    <button className="btn btn-sm" onClick={() => removeSite(site.id)} style={{ color: 'var(--red)' }}><i className="hgi-stroke hgi-delete-02" /></button>
                  </div>
                </div>
                <div className="card-body" style={{ paddingTop: 14 }}>
                  {/* Drop zone */}
                  <div
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => {
                      e.preventDefault(); setDragOver(false);
                      const f = e.dataTransfer.files[0];
                      if (f) onFile(site.id, f);
                    }}
                    onClick={() => document.getElementById(`file-${site.id}`)?.click()}
                    style={{
                      border: `1.5px dashed ${dragOver ? 'var(--coral)' : 'var(--border)'}`,
                      background: dragOver ? 'rgba(232,90,40,0.04)' : 'var(--bg)',
                      borderRadius: 12, padding: '18px 14px', textAlign: 'center', cursor: 'pointer',
                      transition: 'border-color .15s, background .15s',
                    }}
                  >
                    <input id={`file-${site.id}`} ref={site.id === deployingId ? fileRef : undefined} type="file" accept=".zip,.html,.htm" style={{ display: 'none' }} onChange={e => onFile(site.id, e.target.files?.[0] || null)} />
                    <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      {isDeploying ? <><span className="spin" /> Uploading to Shelby…</> : <><i className="hgi-stroke hgi-upload-01" /> Drop ZIP or HTML here or click to browse</>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>ZIP with index.html at root · single HTML also works · served via Shelby blobs with SPA fallback</div>
                  </div>

                  {/* ── Deploy from GitHub panel ─────────────────────── */}
                  {gitPanel === site.id && (
                    <div style={{ marginTop: 14, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg)', overflow: 'hidden' }}>
                      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <i className="hgi-stroke hgi-github" style={{ fontSize: 16 }} />
                        <strong style={{ fontSize: 13 }}>Push-to-deploy</strong>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>git push → build → Shelby blobs</span>
                        <a href="/docs/sites" target="_blank" rel="noreferrer" className="btn btn-sm" style={{ marginLeft: 'auto', padding: '3px 8px', fontSize: 11 }}>Guide</a>
                      </div>
                      <div style={{ padding: 16 }} className="sites-git-panel">
                        {/* Step 1 — key */}
                        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>1 · Deploy key</div>
                        {newKey ? (
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                            <code className="mono" style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--coral)', borderRadius: 6, padding: '6px 10px', fontSize: 11, wordBreak: 'break-all' }}>{newKey}</code>
                            <button className="btn btn-sm btn-primary" onClick={() => copy(newKey, 'Key')}><i className="hgi-stroke hgi-file-01" /> Copy</button>
                          </div>
                        ) : (
                          <button className="btn btn-sm" onClick={() => createKey(site.id)}><i className="hgi-stroke hgi-add-01" /> Create deploy key</button>
                        )}
                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 12 }}>Add it as the <code style={{ fontFamily: 'var(--font-mono)' }}>PROVENODE_DEPLOY_KEY</code> secret in your repo (Settings → Secrets → Actions). Site-scoped: it can only deploy this site.</div>
                        {(siteKeys[site.id] || []).length > 0 && (
                          <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
                            {siteKeys[site.id].map((k, i) => (
                              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, padding: '6px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
                                <i className="hgi-stroke hgi-plug-01" style={{ color: 'var(--green)' }} />
                                <span className="mono">{k.token}</span>
                                <span style={{ color: 'var(--text-muted)' }}>· {k.label}</span>
                                <button className="btn btn-sm" style={{ marginLeft: 'auto', color: 'var(--red)', padding: '3px 8px', fontSize: 11 }} onClick={() => revokeKey(site.id, k.token)}>Revoke</button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Step 2 — workflow */}
                        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '14px 0 8px' }}>2 · GitHub Action workflow</div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 8 }}>Save as <code style={{ fontFamily: 'var(--font-mono)' }}>.github/workflows/deploy.yml</code> in your repo:</div>
                        <div style={{ position: 'relative' }}>
                          <button className="btn btn-sm" style={{ position: 'absolute', top: 8, right: 8, zIndex: 2 }} onClick={() => copy(workflowYaml({ siteId: site.id, origin, buildCmd: BUILD_CMDS[site.framework] || BUILD_CMDS.other }), 'Workflow')}><i className="hgi-stroke hgi-file-01" /> Copy YAML</button>
                          <pre className="mono" style={{ margin: 0, padding: 14, background: '#17150F', color: '#D6D2C6', borderRadius: 10, fontSize: 10.5, lineHeight: 1.6, overflowX: 'auto', maxHeight: 260, overflowY: 'auto' }}>
                            {workflowYaml({ siteId: site.id, origin, buildCmd: BUILD_CMDS[site.framework] || BUILD_CMDS.other })}
                          </pre>
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 10, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                          <i className="hgi-stroke hgi-information-circle" style={{ marginTop: 1, flexShrink: 0 }} />
                          <span>Adjust the Package step if your build outputs to <code style={{ fontFamily: 'var(--font-mono)' }}>dist/</code>: <code style={{ fontFamily: 'var(--font-mono)' }}>cd dist && zip -r ../site.zip .</code>. Pushes to <b>main</b> go live; PRs get an immutable preview URL comment.</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Deployments — with instant rollback */}
                  {deps.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Deployments</div>
                        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>· every deploy is an immutable snapshot — promote any of them instantly</span>
                      </div>
                      <div style={{ display: 'grid', gap: 8 }}>
                        {deps.slice(0, 8).map(d => {
                          const isLive = site.lastDeploymentId === d.id;
                          const busy = rollingBack === d.id;
                          return (
                            <div key={d.id} style={{
                              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                              background: isLive ? 'var(--green-wash)' : 'var(--bg)',
                              border: `1px solid ${isLive ? 'rgba(30,127,78,.3)' : 'var(--border)'}`,
                              borderRadius: 10, fontSize: 12, flexWrap: 'wrap',
                            }}>
                              {isLive
                                ? <span className="badge badge-green" style={{ fontSize: 10 }}><i className="hgi-stroke hgi-tick-01" /> LIVE</span>
                                : <span className="badge badge-demo mono" style={{ fontSize: 10 }}>{d.id.slice(0, 10)}</span>}
                              <span style={{ color: 'var(--text-muted)' }}>{d.fileCount} files · {(d.totalBytes / 1024).toFixed(1)} KB</span>
                              <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{new Date(d.createdAt).toLocaleString()}</span>
                              <a href={`/api/sites/${site.id}/preview/${d.id}/`} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ padding: '4px 8px', fontSize: 11 }}>
                                <i className="hgi-stroke hgi-view" /> Preview
                              </a>
                              {!isLive && (
                                <button className="btn btn-sm btn-primary" style={{ padding: '4px 8px', fontSize: 11 }} disabled={busy} onClick={() => rollback(site.id, d.id)}>
                                  {busy ? <><span className="spin" /> Promoting</> : <><i className="hgi-stroke hgi-refresh" /> Rollback to this</>}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {site.rollbackHistory && site.rollbackHistory.length > 0 && (
                        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-faint)' }}>
                          Last rollback: {new Date(site.rollbackHistory[0].at).toLocaleString()} — {site.rollbackHistory[0].from?.slice(0, 10)} → {site.rollbackHistory[0].to?.slice(0, 10)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview modal */}
      {preview && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,0.45)', backdropFilter: 'blur(6px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setPreview(null)}>
          <div className="card" style={{ width: 'min(980px, 96vw)', height: 'min(78vh, 720px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div className="card-header">
              <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}><i className="hgi-stroke hgi-view" /> Preview — {preview.site.slug} · {preview.deployment.id.slice(0, 10)}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <a href={`/api/sites/${preview.site.id}/serve/`} target="_blank" rel="noreferrer" className="btn btn-sm"><i className="hgi-stroke hgi-link-01" /> Open /s/{preview.site.slug}</a>
                <button className="btn btn-sm" onClick={() => setPreview(null)}>Close</button>
              </div>
            </div>
            <iframe title="preview" src={`/api/sites/${preview.site.id}/serve/`} style={{ flex: 1, border: 'none', background: '#fff' }} sandbox="allow-scripts allow-same-origin" />
            <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <span>{preview.deployment.fileCount} files</span>
              <span className="mono">{preview.deployment.manifestObjectId?.slice(0, 42)}…</span>
              <span style={{ marginLeft: 'auto' }}>Shelby-anchored · 90d</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
