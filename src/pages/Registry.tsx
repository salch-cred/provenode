import React, { useEffect, useState } from 'react';
import { get, post } from '../lib/api';
import { fmt, ago } from '../lib/utils';
import { useToast } from '../contexts/AppContext';

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
        <div className="flex gap-2"><button className="btn btn-sm" onClick={load}>↻</button></div></div>
      <div className="table-wrap"><table><thead><tr><th>Model</th><th>Mode</th><th>SHA-256</th><th>Size</th><th>Object ID</th><th>Actions</th></tr></thead>
      <tbody>{!models.length ? <tr><td colSpan={6} className="empty">No models yet.</td></tr> :
        models.map(m => (
          <tr key={m.id}>
            <td><strong>{m.model}</strong><br/><span className="text-sm text-muted">{ago(m.createdAt)}</span></td>
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