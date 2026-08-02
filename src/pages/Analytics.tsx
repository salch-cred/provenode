import React, { useEffect, useState } from 'react';
import { get } from '../lib/api';

export default function Analytics() {
  const [summary, setSummary] = useState<any>({});
  useEffect(() => { get<any>('/api/analytics').then(d=>setSummary(d.summary||{})).catch(()=>{}); }, []);

  const Bucket = ({title, data}:{title:string; data:Record<string,number>}) => (
    <div className="card"><div className="card-header"><span className="card-title">{title}</span></div>
    <div className="card-body">{Object.entries(data||{}).map(([k,v])=>(
      <div className="flex items-center gap-2 mb-1" key={k}><span className="text-sm fw-700">{k}</span><span className="ml-auto badge badge-demo">{v}</span></div>
    ))}</div></div>
  );

  return (
    <div>
      <div className="stat-grid mb-4" style={{gridTemplateColumns:'repeat(2,1fr)'}}>
        <div className="stat-card"><div className="stat-label">Total Devices</div><div className="stat-value">{summary.total||0}</div></div>
        <div className="stat-card"><div className="stat-label">Online</div><div className="stat-value" style={{color:'var(--green)'}}>{summary.online||0}</div></div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:16}}>
        <Bucket title="By type" data={summary.byType} />
        <Bucket title="By location" data={summary.byLocation} />
        <Bucket title="By fleet" data={summary.byFleet} />
      </div>
    </div>
  );
}