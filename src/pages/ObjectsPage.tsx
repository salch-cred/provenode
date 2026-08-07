import React, { useEffect, useState } from 'react';
import { get } from '../lib/api';
import { fmt, ago } from '../lib/utils';

export default function ObjectsPage() {
  const [objects, setObjects] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const load = async () => { const d = await get<any>('/api/objects').catch(()=>({objects:[],stats:{}})); setObjects(d.objects||[]); setStats(d.stats||{}); };
  useEffect(() => { load(); }, []);
  return (
    <div>
      <div className="stat-grid mb-4">
        <div className="stat-card"><div className="stat-label">Total</div><div className="stat-value" style={{color:'var(--shelby)'}}>{stats.total||0}</div></div>
        <div className="stat-card"><div className="stat-label">Healthy</div><div className="stat-value" style={{color:'var(--green)'}}>{stats.healthy||0}</div></div>
        <div className="stat-card"><div className="stat-label">Expiring soon</div><div className="stat-value" style={{color:'var(--amber)'}}>{stats.expiringSoon||0}</div></div>
        <div className="stat-card"><div className="stat-label">Expired</div><div className="stat-value" style={{color:'var(--red)'}}>{stats.expired||0}</div></div>
      </div>
      <div className="card"><div className="card-header"><span className="card-title">Shelby object registry</span><button className="btn btn-sm" onClick={load}>↻</button></div>
        <div className="table-wrap"><table><thead><tr><th>Model</th><th>Object ID</th><th>Size</th><th>Expiry</th><th>Created</th></tr></thead>
        <tbody>{!objects.length ? <tr><td colSpan={5}>
          <div className="empty" style={{padding:'40px 20px', display:'flex', flexDirection:'column', alignItems:'center', gap:12}}>
            <i className="hgi-stroke hgi-cloud-01" style={{fontSize:40, opacity:0.2}} />
            <div style={{fontWeight:700, fontSize:15}}>No objects in Shelby storage</div>
            <div style={{fontSize:13, opacity:0.55}}>Deploy a model in Shelby mode to create persisted object blobs with provenance tracking</div>
          </div>
        </td></tr> :
          objects.map(o=><tr key={o.id}><td><strong>{o.model}</strong></td><td className="mono text-sm">{(o.objectId||'').slice(0,40)}…</td><td>{fmt(o.size)}</td>
            <td><span className={`badge ${o.status==='healthy'?'badge-green':o.status==='expiring_soon'?'badge-amber':'badge-red'}`}>{o.daysLeft!=null?`${o.daysLeft}d left`:'unknown'}</span></td><td>{ago(o.createdAt)}</td></tr>)}
        </tbody></table></div></div>
    </div>
  );
}