import React, { useEffect, useState } from 'react';
import { get, post } from '../lib/api';
import { ago } from '../lib/utils';
import { useToast } from '../contexts/AppContext';

export default function Bluegreen() {
  const toast = useToast();
  const [configs, setConfigs] = useState<any[]>([]); const [deps, setDeps] = useState<any[]>([]);
  const [projectId, setProjectId] = useState(''); const [name, setName] = useState('');
  const [blueId, setBlueId] = useState(''); const [greenId, setGreenId] = useState('');

  const load = async () => {
    const [c,d] = await Promise.all([get<any>('/api/bluegreen').catch(()=>({configs:[]})), get<any>('/api/status').catch(()=>({deployments:[]}))]);
    setConfigs(c.configs||[]); setDeps(d.deployments||[]);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!projectId||!name) { toast('Project ID and name required','error'); return; }
    try { await post('/api/bluegreen', { projectId, name, blueDeploymentId:blueId, greenDeploymentId:greenId }); toast('Config created!','success'); load(); }
    catch(e:any){ toast(e.message,'error'); }
  };
  const switchSlot = async (pid:string) => {
    try { const d = await post<any>('/api/bluegreen/switch', { projectId: pid }); toast(`Switched to ${d.switched.to.toUpperCase()}!`,'success'); load(); }
    catch(e:any){ toast(e.message,'error'); }
  };

  return (
    <div style={{display:'grid',gridTemplateColumns:'1fr 340px',gap:20}}>
      <div className="card"><div className="card-header"><span className="card-title">Blue-Green deployments</span><button className="btn btn-sm" onClick={load}>↻</button></div>
        <div style={{padding:12}}>{!configs.length ? <div className="empty">No blue-green configs.</div> : configs.map(c => (
          <div className="card card-sm mb-3" key={c.projectId}>
            <div className="card-header"><span className="card-title">{c.name}</span><span className={`badge ${c.activeSlot==='blue'?'badge-blue':'badge-green'}`}>ACTIVE: {c.activeSlot.toUpperCase()}</span></div>
            <div className="card-body" style={{padding:12}}>
              <div className="flex gap-4 text-sm mb-3">
                <div><span className="form-label">Blue</span><div className="mono">{(c.blueDeploymentId||'—').slice(0,12)}…</div></div>
                <div><span className="form-label">Green</span><div className="mono">{(c.greenDeploymentId||'—').slice(0,12)}…</div></div>
              </div>
              <button className="btn btn-sm btn-primary" onClick={()=>switchSlot(c.projectId)}>⇄ Switch Active Slot</button>
              {c.history?.length>0 && <div className="text-muted text-sm" style={{marginTop:8}}>Last switch: {ago(c.history[0]?.at)}</div>}
            </div></div>
        ))}</div></div>
      <div className="card"><div className="card-header"><span className="card-title">Configure B/G</span></div>
        <div className="card-body">
          <div className="form-group"><label className="form-label">Project ID</label><input value={projectId} onChange={e=>setProjectId(e.target.value)} placeholder="vision-edge-prod" /></div>
          <div className="form-group"><label className="form-label">Name</label><input value={name} onChange={e=>setName(e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Blue deployment</label><select value={blueId} onChange={e=>setBlueId(e.target.value)}><option value="">—</option>{deps.map(d=><option key={d.id} value={d.id}>{d.model} v{d.version}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Green deployment</label><select value={greenId} onChange={e=>setGreenId(e.target.value)}><option value="">—</option>{deps.map(d=><option key={d.id} value={d.id}>{d.model} v{d.version}</option>)}</select></div>
          <button className="btn btn-primary" onClick={create}>Save config</button>
        </div></div>
    </div>
  );
}