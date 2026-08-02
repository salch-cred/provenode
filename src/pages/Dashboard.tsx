import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { get } from '../lib/api';
import { fmt, ago, esc } from '../lib/utils';

export default function Dashboard() {
  const [models, setModels] = useState<any[]>([]);
  const [deps, setDeps] = useState<any[]>([]);
  const [objStats, setObjStats] = useState<any>({});

  const load = async () => {
    const [m, s, o] = await Promise.all([
      get<any>('/api/models').catch(() => ({models:[]})),
      get<any>('/api/status').catch(() => ({deployments:[]})),
      get<any>('/api/objects').catch(() => ({stats:{}})),
    ]);
    setModels(m.models || []); setDeps(s.deployments || []); setObjStats(o.stats || {});
  };
  useEffect(() => { load(); }, []);

  const verified = deps.filter(d => d.status === 'verified').length;
  const inflight = deps.filter(d => d.status === 'deploying').length;

  return (
    <div>
      <div className="stat-grid mb-4">
        <Stat label="Models" value={models.length} sub="In registry" />
        <Stat label="Deployments" value={deps.length} sub="All time" />
        <Stat label="Verified" value={verified} sub="100% complete" color="var(--green)" />
        <Stat label="In Flight" value={inflight} sub="Deploying" color="var(--coral)" />
        <Stat label="Shelby Objects" value={objStats.total || 0} sub="On-chain" color="var(--shelby)" />
        <Stat label="Expiring Soon" value={objStats.expiringSoon || 0} sub="< 7 days" color="var(--amber)" />
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 360px',gap:20}}>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Deployment activity</span>
            <Link to="/app/deploy" className="btn btn-sm btn-primary">+ Deploy</Link>
          </div>
          <div style={{padding:'0 18px'}}>
            {!deps.length ? <div className="empty">No deployments yet. <Link to="/app/deploy">Deploy a model →</Link></div> :
              deps.slice(0,6).map(d => (
                <div className="feed-item" key={d.id}>
                  <div className={`feed-dot ${d.status==='verified'?'green':d.status==='deploying'?'coral':d.status==='rolled_back'?'red':'amber'}`} />
                  <div style={{flex:1}}>
                    <div className="fw-700">{d.model} <span className="text-muted">v{d.version}</span></div>
                    <div className="flex gap-2" style={{margin:'4px 0'}}>
                      <span className={`badge ${d.status==='verified'?'badge-green':d.status==='deploying'?'badge-blue':'badge-amber'}`}>{d.status}</span>
                      <span className={`badge ${d.mode==='shelby'?'badge-shelby':'badge-demo'}`}>{d.mode}</span>
                    </div>
                    <div className="progress-track" style={{width:160}}><div className={`progress-bar ${d.status==='verified'?'green':''}`} style={{width:`${d.progress||0}%`}} /></div>
                  </div>
                  <div className="feed-time">{ago(d.createdAt)}</div>
                </div>
              ))}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><span className="card-title">Recent models</span><Link to="/app/registry" className="btn btn-sm">All →</Link></div>
          <div className="table-wrap"><table><thead><tr><th>Name</th><th>Mode</th><th></th></tr></thead>
          <tbody>{!models.length ? <tr><td colSpan={3} className="empty">No models yet.</td></tr> :
            models.slice(0,5).map(m => (
              <tr key={m.id}><td><strong>{m.model}</strong></td>
              <td><span className={`badge ${m.mode==='shelby'?'badge-shelby':'badge-demo'}`}>{m.mode}</span></td>
              <td><Link to={`/verify?id=${m.id}&name=${encodeURIComponent(m.model)}&hash=${m.sha256}`} target="_blank" className="btn btn-sm">Proof</Link></td></tr>
            ))}
          </tbody></table></div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, color }: { label:string; value:number|string; sub:string; color?:string }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={color?{color}:{}}>{value}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  );
}