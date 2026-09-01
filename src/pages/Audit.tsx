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
          <select aria-label="Filter by event type" className="form-input" value={action} onChange={e=>setAction(e.target.value)} style={{width:220}}>
            <option value="">All events</option>
            <option>model.registered</option><option>deployment.started</option><option>deployment.verified</option>
            <option>deployment.rolled_back</option><option>canary.advanced</option><option>bluegreen.switched</option>
            <option>marketplace.published</option><option>schedule.created</option><option>integrity.mismatch</option>
          </select>
          <input aria-label="Maximum records" className="form-input" type="number" value={limit} onChange={e=>setLimit(+e.target.value)} style={{width:70}} />
          <button className="btn btn-sm btn-primary" onClick={load}>Load</button>
        </div></div>
      <div className="table-wrap"><table><thead><tr><th>Timestamp</th><th>Event</th><th>Actor</th><th>Target</th></tr></thead>
      <tbody>{!records.length ? <tr><td colSpan={4}>
        <div className="empty" style={{padding:'40px 20px', display:'flex', flexDirection:'column', alignItems:'center', gap:12}}>
          <i className="hgi-stroke hgi-audit-02" style={{fontSize:40, opacity:0.2}} />
          <div style={{fontWeight:700, fontSize:15}}>No audit records loaded</div>
          <div style={{fontSize:13, opacity:0.55}}>Select an event filter and click Load to fetch immutable on-chain records</div>
        </div>
      </td></tr> :
        records.map((r,i)=><tr key={i}><td className="mono text-sm">{new Date(r.timestamp).toLocaleString()}</td><td><span className="tag">{r.action}</span></td><td className="text-sm">{r.actor}</td><td className="mono text-sm">{r.target||'—'}</td></tr>)}
      </tbody></table></div>
    </div>
  );
}