import React, { useEffect, useState } from 'react';
import { get, post } from '../lib/api';
import { ago } from '../lib/utils';
import { useToast } from '../contexts/AppContext';

export default function Fleet() {
  const toast = useToast();
  const [devices, setDevices] = useState<any[]>([]);
  const [canaryDeps, setCanaryDeps] = useState<any[]>([]);

  const load = async () => {
    const [d, s] = await Promise.all([get<any>('/api/devices').catch(()=>({devices:[]})), get<any>('/api/status').catch(()=>({deployments:[]}))]);
    setDevices(d.devices||[]);
    setCanaryDeps((s.deployments||[]).filter((x:any)=>x.canary && x.status!=='verified' && x.status!=='rolled_back'));
  };
  useEffect(() => { load(); }, []);

  const advance = async (id:string) => { try{ await post(`/api/fleet/canary/${id}/advance`); toast('Advanced!','success'); load(); }catch(e:any){toast(e.message,'error');} };
  const rollback = async (id:string) => { try{ await post(`/api/fleet/canary/${id}/rollback`); toast('Rolled back.','warning'); load(); }catch(e:any){toast(e.message,'error');} };

  return (
    <div style={{display:'grid',gridTemplateColumns:'1fr 360px',gap:20}}>
      <div className="card"><div className="card-header"><span className="card-title">Fleet OTA status</span><button className="btn btn-sm" onClick={load}>↻</button></div>
        <div className="table-wrap"><table><thead><tr><th>Device</th><th>Location</th><th>Status</th><th>Last seen</th></tr></thead>
        <tbody>{!devices.length ? <tr><td colSpan={4} className="empty">No devices.</td></tr> :
          devices.map(d=><tr key={d.id}><td className="mono fw-700">{d.id}</td><td>{d.location}</td>
            <td><span className={`badge ${d.status==='online'?'badge-green':'badge-amber'}`}>{d.status}</span></td><td>{ago(d.lastSeenAt)}</td></tr>)}
        </tbody></table></div></div>
      <div className="card"><div className="card-header"><span className="card-title">Active canary deployments</span></div>
        <div style={{padding:12}}>
          {!canaryDeps.length ? <div className="empty">No active canary deployments.</div> : canaryDeps.map(d => {
            const stages = d.canary.stages; const cur = d.canary.currentStage;
            return <div className="card card-sm" style={{marginBottom:12}} key={d.id}>
              <div className="card-header"><span className="card-title">{d.model}</span><span className="badge badge-blue">canary {stages[cur]}%</span></div>
              <div className="card-body" style={{padding:12}}>
                <div className="flex gap-2 mb-2">{stages.map((s:number,i:number)=><span key={i} className={`badge ${i<cur?'badge-green':i===cur?'badge-blue':'badge-demo'}`}>{s}%</span>)}</div>
                <div className="flex gap-2"><button className="btn btn-sm btn-primary" onClick={()=>advance(d.id)}>Advance →</button><button className="btn btn-sm btn-danger" onClick={()=>rollback(d.id)}>Rollback</button></div>
              </div></div>;
          })}
        </div></div>
    </div>
  );
}