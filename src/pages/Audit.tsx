import React, { useState } from 'react';
import { get } from '../lib/api';

export default function Audit() {
  const [action, setAction] = useState(''); const [limit, setLimit] = useState(100);
  const [records, setRecords] = useState<any[]>([]);

  const load = async () => {
    const qs = new URLSearchParams({ limit: String(limit) }); if (action) qs.set('action', action);
    const d = await get<any>(`/api/audit?${qs}`).catch(()=>({records:[]}));
    setRecords(d.records||[]);
  };

  return (
    <div className="card">
      <div className="card-header"><span className="card-title">Immutable audit log</span>
        <div className="flex gap-2">
          <select value={action} onChange={e=>setAction(e.target.value)} style={{width:220,padding:'5px 8px',border:'2px solid var(--border)',borderRadius:6,fontSize:12}}>
            <option value="">All events</option>
            <option>model.registered</option><option>deployment.started</option><option>deployment.verified</option>
            <option>deployment.rolled_back</option><option>canary.advanced</option><option>bluegreen.switched</option>
            <option>marketplace.published</option><option>schedule.created</option><option>integrity.mismatch</option>
          </select>
          <input type="number" value={limit} onChange={e=>setLimit(+e.target.value)} style={{width:70,padding:'5px 8px',border:'2px solid var(--border)',borderRadius:6,fontSize:12}} />
          <button className="btn btn-sm btn-primary" onClick={load}>Load</button>
        </div></div>
      <div className="table-wrap"><table><thead><tr><th>Timestamp</th><th>Event</th><th>Actor</th><th>Target</th></tr></thead>
      <tbody>{!records.length ? <tr><td colSpan={4} className="empty">Click "Load" to fetch audit records.</td></tr> :
        records.map((r,i)=><tr key={i}><td className="mono text-sm">{new Date(r.timestamp).toLocaleString()}</td><td><span className="tag">{r.action}</span></td><td className="text-sm">{r.actor}</td><td className="mono text-sm">{r.target||'—'}</td></tr>)}
      </tbody></table></div>
    </div>
  );
}