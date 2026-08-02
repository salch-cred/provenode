import React, { useEffect, useState } from 'react';
import { get, post, del } from '../lib/api';
import { useToast } from '../contexts/AppContext';

export default function Schedule() {
  const toast = useToast();
  const [jobs, setJobs] = useState<any[]>([]); const [models, setModels] = useState<any[]>([]);
  const [modelId, setModelId] = useState(''); const [when, setWhen] = useState(''); const [region, setRegion] = useState('Global');
  const [canary, setCanary] = useState(false); const [label, setLabel] = useState('');

  const load = async () => {
    const [j, m] = await Promise.all([get<any>('/api/schedule').catch(()=>({jobs:[]})), get<any>('/api/models').catch(()=>({models:[]}))]);
    setJobs(j.jobs||[]); setModels(m.models||[]);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!modelId||!when) { toast('Model and date/time required','error'); return; }
    try { await post('/api/schedule', { modelId, scheduledFor:new Date(when).toISOString(), region, canary, label }); toast('Scheduled!','success'); load(); }
    catch(e:any){ toast(e.message,'error'); }
  };
  const cancel = async (id:string) => { await del(`/api/schedule?id=${id}`).catch(()=>{}); toast('Cancelled.','info'); load(); };

  return (
    <div style={{display:'grid',gridTemplateColumns:'1fr 340px',gap:20}}>
      <div className="card"><div className="card-header"><span className="card-title">Scheduled deployments</span><button className="btn btn-sm" onClick={load}>↻</button></div>
        <div style={{padding:12}}>{!jobs.length ? <div className="empty">No scheduled deployments.</div> : jobs.map(j => (
          <div className="card card-sm mb-2" key={j.id}><div className="card-header"><span className="card-title">{j.label||j.id.slice(0,8)}</span>
            <span className={`badge ${j.status==='pending'?'badge-blue':j.status==='triggered'?'badge-green':'badge-red'}`}>{j.status}</span></div>
          <div className="card-body" style={{padding:'10px 14px'}}>
            <div className="text-sm">{new Date(j.scheduledFor).toLocaleString()} · {j.region}{j.canary?' · canary':''}</div>
            <button className="btn btn-sm btn-danger" style={{marginTop:8}} onClick={()=>cancel(j.id)}>Cancel</button>
          </div></div>
        ))}</div></div>
      <div className="card"><div className="card-header"><span className="card-title">Schedule new</span></div>
        <div className="card-body">
          <div className="form-group"><label className="form-label">Model</label><select value={modelId} onChange={e=>setModelId(e.target.value)}><option value="">—</option>{models.map(m=><option key={m.id} value={m.id}>{m.model}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Date & Time</label><input type="datetime-local" value={when} onChange={e=>setWhen(e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Region</label><select value={region} onChange={e=>setRegion(e.target.value)}><option>Global</option><option>Asia-Pacific</option><option>Europe</option></select></div>
          <div className="form-group"><label className="form-label">Label</label><input value={label} onChange={e=>setLabel(e.target.value)} /></div>
          <div className="form-group"><label className="form-label" style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" checked={canary} onChange={e=>setCanary(e.target.checked)} style={{width:'auto'}} /> Canary rollout</label></div>
          <button className="btn btn-primary" onClick={create}>Schedule</button>
        </div></div>
    </div>
  );
}