import React, { useState } from 'react';
import { get } from '../lib/api';
import { ago } from '../lib/utils';

export default function Compliance() {
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [report, setReport] = useState<any>(null);

  const generate = async () => {
    const qs = new URLSearchParams(); if(from) qs.set('from',from); if(to) qs.set('to',to);
    const d = await get<any>(`/api/compliance?${qs}`).catch(()=>null);
    setReport(d?.report || null);
  };
  const exportCSV = () => { const qs = new URLSearchParams({format:'csv'}); if(from)qs.set('from',from); if(to)qs.set('to',to); window.open(`/api/compliance?${qs}`); };

  return (
    <div style={{maxWidth:800}}>
      <div className="card mb-4"><div className="card-header"><span className="card-title">Compliance report</span>
        <div className="flex gap-2"><button className="btn btn-sm btn-primary" onClick={generate}>Generate</button><button className="btn btn-sm" onClick={exportCSV}>Export CSV ↓</button></div></div>
        <div className="card-body"><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <div className="form-group"><label className="form-label">From</label><input className="form-input" type="date" value={from} onChange={e=>setFrom(e.target.value)} /></div>
          <div className="form-group"><label className="form-label">To</label><input className="form-input" type="date" value={to} onChange={e=>setTo(e.target.value)} /></div>
        </div></div></div>
      {!report ? (
        <div className="empty" style={{padding:'48px 20px', display:'flex', flexDirection:'column', alignItems:'center', gap:12}}>
          <i className="hgi-stroke hgi-license" style={{fontSize:44, opacity:0.2}} />
          <div style={{fontWeight:700, fontSize:15}}>No report generated</div>
          <div style={{fontSize:13, opacity:0.55}}>Select a date range and click Generate to produce an EU AI Act compliance summary</div>
        </div>
      ) : <>
        <div className="stat-grid mb-4" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
          <div className="stat-card"><div className="stat-label">Models</div><div className="stat-value">{report.summary?.models||0}</div></div>
          <div className="stat-card"><div className="stat-label">Deployments</div><div className="stat-value">{report.summary?.deployments||0}</div></div>
          <div className="stat-card"><div className="stat-label">Devices</div><div className="stat-value">{report.summary?.devices||0}</div></div>
          <div className="stat-card"><div className="stat-label">Shelby mode</div><div className="stat-value" style={{color:'var(--shelby)'}}>{report.summary?.shelbyMode||0}</div></div>
        </div>
        <div className="card"><div className="card-header"><span className="card-title">Model audit trail</span></div>
          <div className="table-wrap"><table><thead><tr><th>ID</th><th>Model</th><th>Mode</th><th>Registered</th></tr></thead>
          <tbody>{(report.models||[]).map((m:any)=><tr key={m.id}><td className="mono text-sm">{m.id.slice(0,8)}…</td><td>{m.model}</td>
            <td><span className={`badge ${m.mode==='shelby'?'badge-shelby':'badge-demo'}`}>{m.mode}</span></td><td>{ago(m.createdAt)}</td></tr>)}
          </tbody></table></div></div>
      </>}
    </div>
  );
}