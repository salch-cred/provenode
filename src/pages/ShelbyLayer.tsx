import React, { useEffect, useState } from 'react';
import { get } from '../lib/api';

export default function ShelbyLayer() {
  const [status, setStatus] = useState<any>({});
  const [identity, setIdentity] = useState<any>({});
  const [models, setModels] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([get<any>('/api/shelby-status').catch(()=>({})), get<any>('/api/identity').catch(()=>({})), get<any>('/api/models').catch(()=>({models:[]}))])
      .then(([s,i,m]) => { setStatus(s); setIdentity(i); setModels(m.models||[]); });
  }, []);

  const shelbyModels = models.filter(m=>m.mode==='shelby');

  return (
    <div>
      <div className={`card ${status.connected?'':'card-sm'} mb-4`} style={{padding:'14px 18px'}}>
        {status.connected ? (
          <div>
            <div className="shelby-panel-title"><i className="hgi-stroke hgi-blockchain-01" /> SHELBY · PRODUCTION · {status.network}</div>
            <div className="flex gap-2 flex-wrap">
              {identity.configured ? <><span className="badge badge-shelby">Persistent Identity</span><span className="mono text-sm" style={{marginLeft:4}}>{(identity.address||'').slice(0,14)}…</span></> : <span className="badge badge-demo">Ephemeral Keys</span>}
            </div>
          </div>
        ) : (
          <div><div className="flex gap-2 mb-2"><span className="badge badge-demo">Demo Mode</span><strong>Shelby not configured</strong></div>
          <div className="text-muted text-sm">Set SHELBY_API_KEY and SHELBY_PRIVATE_KEY in Vercel env vars.</div></div>
        )}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
        <div className="card"><div className="card-header"><span className="card-title">Object proofs</span><span className="badge badge-shelby">{shelbyModels.length}</span></div>
          <div className="card-body" style={{padding:12}}>
            {!models.length ? <div className="empty">No models yet.</div> : models.map(m => (
              <div className="proof-card" key={m.id}>
                <div className="flex items-center gap-2 mb-2"><span className={`badge ${m.mode==='shelby'?'badge-shelby':'badge-demo'}`}>{m.mode}</span><strong>{m.model}</strong></div>
                <div className="proof-hash mb-2">{m.objectId || '—'}</div>
              </div>
            ))}
          </div></div>
        <div>
          <div className="card mb-4"><div className="card-header"><span className="card-title">Total registered</span></div><div className="card-body"><div className="stat-value">{models.length}</div></div></div>
          <div className="card"><div className="card-header"><span className="card-title">Architecture</span></div><div className="card-body" style={{fontSize:12,lineHeight:2.2}}>
            <div className="flex gap-2"><span className="badge badge-blue">1</span><strong>Upload</strong> SHA-256 + KV record</div>
            <div className="flex gap-2"><span className="badge badge-shelby">2</span><strong>Shelby</strong> on-chain object</div>
            <div className="flex gap-2"><span className="badge badge-green">3</span><strong>Manifest</strong> on-chain blob</div>
            <div className="flex gap-2"><span className="badge badge-amber">4</span><strong>Device</strong> verify + activate</div>
          </div></div>
        </div>
      </div>
    </div>
  );
}