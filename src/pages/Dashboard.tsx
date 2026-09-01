import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { get } from '../lib/api';
import { ago } from '../lib/utils';

export default function Dashboard() {
  const [models, setModels]       = useState<any[]>([]);
  const [deps, setDeps]           = useState<any[]>([]);
  const [objStats, setObjStats]   = useState<any>({});
  const [shelby, setShelby]       = useState<any>({});
  const [identity, setIdentity]   = useState<any>({});
  const [health, setHealth]       = useState<any>({});
  const [loading, setLoading]     = useState(true);

  const load = async () => {
    setLoading(true);
    const [m, s, o, sh, id, h] = await Promise.all([
      get<any>('/api/models').catch(() => ({ models: [] })),
      get<any>('/api/status').catch(() => ({ deployments: [] })),
      get<any>('/api/objects').catch(() => ({ stats: {} })),
      get<any>('/api/shelby-status').catch(() => ({})),
      get<any>('/api/identity').catch(() => ({})),
      get<any>('/api/health').catch(() => ({})),
    ]);
    setModels(m.models || []);
    setDeps(s.deployments || []);
    setObjStats(o.stats || {});
    setShelby(sh);
    setIdentity(id);
    setHealth(h);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const verified  = deps.filter(d => d.status === 'verified').length;
  const inflight  = deps.filter(d => d.status === 'deploying').length;
  const shelbyLive = shelby.connected || Boolean(shelby.mode === 'production');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Shelby Network Banner ───────────────────────────────── */}
      <div className="shelby-panel" style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center',
        gap: 20, padding: '14px 20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
            background: shelbyLive ? 'var(--green)' : 'var(--amber)',
            boxShadow: shelbyLive ? '0 0 0 3px rgba(30,127,78,.15)' : '0 0 0 3px rgba(150,105,14,.15)'
          }} />
          <strong style={{ fontSize: 13, fontWeight: 500 }}>
            Shelby Protocol · {shelby.network || 'shelbynet'}
          </strong>
          <span className={`badge ${shelbyLive ? 'badge-shelby' : 'badge-amber'}`}>
            {shelby.mode || 'offline'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginLeft: 'auto' }}>
          <BannerStat label="API" value={shelby.apiUrl ? new URL(shelby.apiUrl).hostname : '—'} />
          <BannerStat label="Identity" value={identity.configured ? `${identity.address?.slice(0,8)}…${identity.address?.slice(-6)}` : 'not set'} />
          <BannerStat label="Build" value={health.version || '—'} />
          <BannerStat label="Env" value={health.environment || '—'} />
        </div>
        {identity.configured && (
          <a
            href={identity.explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="btn btn-sm"
            style={{ marginLeft: 'auto', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            <i className="hgi-stroke hgi-link-01" /> Explorer ↗
          </a>
        )}
      </div>

      {/* ── Stats Grid ──────────────────────────────────────────── */}
      <div className="stat-grid">
        <Stat label="Models"         value={models.length}      sub="In registry" />
        <Stat label="Deployments"    value={deps.length}        sub="All time" />
        <Stat label="Verified"       value={verified}           sub="100% complete"  color="var(--green)" />
        <Stat label="In Flight"      value={inflight}           sub="Deploying"      color="var(--coral)" />
        <Stat label="Shelby Objects" value={objStats.total||0}  sub="On-chain"       color="var(--shelby)" />
        <Stat label="Expiring Soon"  value={objStats.expiringSoon||0} sub="< 7 days" color="var(--amber)" />
      </div>

      {/* ── Shelby Info Cards ───────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16 }}>
        <InfoCard
          icon="hgi-blockchain-01"
          color="var(--shelby)"
          title="Network"
          rows={[
            { label: 'Chain', value: 'Aptos L1' },
            { label: 'Network', value: shelby.network || 'shelbynet' },
            { label: 'Mode', value: shelby.mode || '—' },
            { label: 'API', value: shelby.apiUrl ? 'shelby.xyz' : '—' },
          ]}
        />
        <InfoCard
          icon="hgi-shield-02"
          color="var(--green)"
          title="Identity"
          rows={[
            { label: 'Configured', value: identity.configured ? 'Yes' : 'No' },
            { label: 'Address', value: identity.address ? `${identity.address.slice(0,10)}…` : '—' },
            { label: 'Pub Key', value: identity.publicKey ? `${identity.publicKey.slice(0,10)}…` : '—' },
            { label: 'Algo', value: 'Ed25519' },
          ]}
        />
        <InfoCard
          icon="hgi-package"
          color="var(--coral)"
          title="Object Store"
          rows={[
            { label: 'Total Objects', value: String(objStats.total || 0) },
            { label: 'Expiring Soon', value: String(objStats.expiringSoon || 0) },
            { label: 'Storage Tier', value: 'Immutable' },
            { label: 'Replication', value: 'Shelbynet' },
          ]}
        />
        <InfoCard
          icon="hgi-workflow-square-01"
          color="var(--amber)"
          title="Runtime"
          rows={[
            { label: 'Service', value: health.service || 'provenode' },
            { label: 'Build', value: health.version || 'local' },
            { label: 'Env', value: health.environment || 'dev' },
            { label: 'Last Ping', value: health.timestamp ? ago(health.timestamp) : '—' },
          ]}
        />
      </div>

      {/* ── Activity + Recent Models ────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20 }}>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Deployment activity</span>
            <Link to="/app/deploy" className="btn btn-sm btn-primary">+ Deploy</Link>
          </div>
          <div style={{ padding: '0 18px' }}>
            {!deps.length
              ? <div className="empty">No deployments yet. <Link to="/app/deploy">Deploy a model →</Link></div>
              : deps.slice(0, 6).map(d => (
                <div className="feed-item" key={d.id}>
                  <div className={`feed-dot ${d.status==='verified'?'green':d.status==='deploying'?'coral':d.status==='rolled_back'?'red':'amber'}`} />
                  <div style={{ flex: 1 }}>
                    <div className="fw-700">{d.model} <span className="text-muted">v{d.version}</span></div>
                    <div className="flex gap-2" style={{ margin: '4px 0' }}>
                      <span className={`badge ${d.status==='verified'?'badge-green':d.status==='deploying'?'badge-blue':'badge-amber'}`}>{d.status}</span>
                      <span className={`badge ${d.mode==='shelby'?'badge-shelby':'badge-amber'}`}>{d.mode}</span>
                    </div>
                    <div className="progress-track" style={{ width: 160 }}>
                      <div className={`progress-bar ${d.status==='verified'?'green':''}`} style={{ width: `${d.progress||0}%` }} />
                    </div>
                  </div>
                  <div className="feed-time">{ago(d.createdAt)}</div>
                </div>
              ))
            }
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Recent models</span>
            <Link to="/app/registry" className="btn btn-sm">All →</Link>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Mode</th><th></th></tr></thead>
              <tbody>
                {!models.length
                  ? <tr><td colSpan={3} className="empty">No models yet.</td></tr>
                  : models.slice(0, 5).map(m => (
                    <tr key={m.id}>
                      <td><strong>{m.model}</strong></td>
                      <td><span className={`badge ${m.mode==='shelby'?'badge-shelby':'badge-amber'}`}>{m.mode}</span></td>
                      <td><Link to={`/verify?id=${m.id}&name=${encodeURIComponent(m.model)}&hash=${m.sha256}`} target="_blank" className="btn btn-sm">Proof</Link></td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Quick Actions ───────────────────────────────────────── */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div className="card-title" style={{ marginBottom: 14 }}>Quick Actions</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link to="/app/deploy"      className="btn btn-primary"><i className="hgi-stroke hgi-rocket-01" /> Deploy Model</Link>
          <Link to="/app/import"      className="btn"><i className="hgi-stroke hgi-cloud-download" /> HF Import</Link>
          <Link to="/app/datasets"    className="btn"><i className="hgi-stroke hgi-workflow-square-01" /> Register Dataset</Link>
          <Link to="/app/zkproof"     className="btn"><i className="hgi-stroke hgi-shield-01" /> Run ZK Proof</Link>
          <Link to="/app/federated"   className="btn"><i className="hgi-stroke hgi-share-01" /> Federated Round</Link>
          <Link to="/app/compliance"  className="btn"><i className="hgi-stroke hgi-note-01" /> EU AI Act Report</Link>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, color }: { label:string; value:number|string; sub:string; color?:string }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={color ? { color } : {}}>{value}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  );
}

function BannerStat({ label, value }: { label:string; value:string }) {
  return (
    <div style={{ fontSize: 12, lineHeight: 1.4 }}>
      <div style={{ opacity: 0.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', fontSize: 10 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 12 }}>{value}</div>
    </div>
  );
}

function InfoCard({ icon, color, title, rows }: { icon:string; color:string; title:string; rows:{label:string;value:string}[] }) {
  return (
    <div className="card" style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <i className={`hgi-stroke ${icon}`} style={{ fontSize: 18, color }} />
        <span style={{ fontWeight: 700, fontSize: 13 }}>{title}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(r => (
          <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
            <span style={{ opacity: 0.55, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px', fontSize: 10 }}>{r.label}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 11 }}>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}