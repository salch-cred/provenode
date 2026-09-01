import React, { useEffect, useState } from 'react';
import { get, post } from '../lib/api';
import { fmt, ago } from '../lib/utils';
import { useToast } from '../contexts/AppContext';
import { QRCodeSVG } from 'qrcode.react';

export default function Registry() {
  const toast = useToast();
  const [models, setModels] = useState<any[]>([]);
  const load = async () => { const d = await get<any>('/api/models').catch(()=>({models:[]})); setModels(d.models||[]); };
  useEffect(() => { load(); }, []);

  const deploy = async (id:string, name:string) => {
    try { await post('/api/deploy', { modelId: id }); toast(`Deployment started for ${name}`, 'success'); }
    catch(e:any){ toast(e.message,'error'); }
  };

  return (
    <div className="card">
      <div className="card-header"><span className="card-title">Model registry</span>
        <div className="flex gap-2"><button className="btn btn-sm" aria-label="Refresh" title="Refresh" onClick={load}><i className="hgi-stroke hgi-refresh" /></button></div></div>
      <div className="table-wrap"><table><thead><tr><th>Model (Provenance QR)</th><th>Mode</th><th>SHA-256</th><th>Size</th><th>Object ID</th><th>Actions</th></tr></thead>
      <tbody>{!models.length ? <tr><td colSpan={6}>
        <div className="empty" style={{padding:'40px 20px', display:'flex', flexDirection:'column', alignItems:'center', gap:12}}>
          <i className="hgi-stroke hgi-database-01" style={{fontSize:40, opacity:0.2}} />
          <div style={{fontWeight:700, fontSize:15}}>No models registered</div>
          <div style={{fontSize:13, opacity:0.55}}>Upload and deploy your first model to populate the registry</div>
        </div>
      </td></tr> :
        models.map(m => (
          <tr key={m.id}>
            <td>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ background: 'var(--surface)', padding: '4px', borderRadius: '6px', display: 'flex', border: '1px solid var(--border)' }}>
                  <QRCodeSVG value={`${window.location.origin}/verify?id=${m.id}`} size={40} />
                </div>
                <div>
                  <strong>{m.model}</strong><br/>
                  <span className="text-sm text-muted">{ago(m.createdAt)}</span>
                  {m.zkVerified && <span className="badge badge-green" style={{marginLeft: 8, fontSize: '0.7rem'}}><i className="hgi-stroke hgi-shield-blockchain" /> ZK Verified</span>}
                </div>
              </div>
            </td>
            <td><span className={`badge ${m.mode==='shelby'?'badge-shelby':'badge-demo'}`}>{m.mode}</span></td>
            <td className="mono">{m.sha256?.slice(0,12)}…</td>
            <td>{fmt(m.size)}</td>
            <td className="mono text-sm text-muted">{(m.objectId||'').slice(0,30)}…</td>
            <td><div className="flex gap-1">
              <button className="btn btn-sm btn-primary" onClick={()=>deploy(m.id,m.model)}>Deploy</button>
              <a href={`/verify?id=${m.id}&name=${encodeURIComponent(m.model)}&hash=${m.sha256}`} target="_blank" rel="noreferrer" className="btn btn-sm">Proof</a>
            </div></td>
          </tr>
        ))}
      </tbody></table></div>
    </div>
  );
}