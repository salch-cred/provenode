import React, { useEffect, useState } from 'react';
import { get, post } from '../lib/api';
import { ago } from '../lib/utils';
import { useToast } from '../contexts/AppContext';

export default function Devices() {
  const toast = useToast();
  const [devices, setDevices] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [id, setId] = useState(''); const [type, setType] = useState('camera');
  const [arch, setArch] = useState('arm64'); const [loc, setLoc] = useState(''); const [fleet, setFleet] = useState('');

  const load = async () => { const d = await get<any>('/api/devices').catch(()=>({devices:[]})); setDevices(d.devices||[]); };
  useEffect(() => { load(); }, []);

  const register = async () => {
    if (!id) { toast('Device ID required.','error'); return; }
    try { await post('/api/devices', { deviceId:id, type, arch, location:loc, fleet }); toast(`Device ${id} registered!`,'success'); load(); setShowForm(false); }
    catch(e:any){ toast(e.message,'error'); }
  };

  const online = devices.filter(d=>d.status==='online').length;

  return (
    <div>
      <div className="stat-grid mb-4" style={{gridTemplateColumns:'repeat(2,1fr)'}}>
        <div className="stat-card"><div className="stat-label">Total Devices</div><div className="stat-value">{devices.length}</div></div>
        <div className="stat-card"><div className="stat-label">Online</div><div className="stat-value" style={{color:'var(--green)'}}>{online}</div></div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 300px',gap:20}}>
        <div className="card">
          <div className="card-header"><span className="card-title">Device inventory</span><button className="btn btn-sm btn-primary" onClick={()=>setShowForm(s=>!s)}>+ Register</button></div>
          {showForm && <div style={{padding:16,borderBottom:'2px solid var(--border)'}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <div className="form-group"><label className="form-label">Device ID</label><input className="form-input" value={id} onChange={e=>setId(e.target.value)} placeholder="CAM-SIN-042" /></div>
              <div className="form-group"><label className="form-label">Type</label><select className="form-input" value={type} onChange={e=>setType(e.target.value)}><option>camera</option><option>drone</option><option>robot</option><option>vehicle</option></select></div>
              <div className="form-group"><label className="form-label">Architecture</label><select className="form-input" value={arch} onChange={e=>setArch(e.target.value)}><option>arm64</option><option>x64</option><option>armv7</option></select></div>
              <div className="form-group"><label className="form-label">Location</label><input className="form-input" value={loc} onChange={e=>setLoc(e.target.value)} placeholder="Singapore" /></div>
              <div className="form-group"><label className="form-label">Fleet</label><input className="form-input" value={fleet} onChange={e=>setFleet(e.target.value)} placeholder="production" /></div>
            </div>
            <button className="btn btn-primary" onClick={register}>Register Device</button>
          </div>}
          <div className="table-wrap"><table><thead><tr><th>Device ID</th><th>Type</th><th>Location</th><th>Fleet</th><th>Status</th><th>Last seen</th></tr></thead>
          <tbody>{!devices.length ? <tr><td colSpan={6}>
            <div className="empty" style={{padding:'40px 20px', display:'flex', flexDirection:'column', alignItems:'center', gap:12}}>
              <i className="hgi-stroke hgi-cpu-01" style={{fontSize:40, opacity:0.2}} />
              <div style={{fontWeight:700, fontSize:15}}>No devices registered</div>
              <div style={{fontSize:13, opacity:0.55}}>Register your first edge device to begin managing fleet deployments</div>
            </div>
          </td></tr> :
            devices.map(d => <tr key={d.id}><td className="mono fw-700">{d.id}</td><td>{d.type}</td><td>{d.location}</td><td>{d.fleet}</td>
              <td><span className={`badge ${d.status==='online'?'badge-green':'badge-amber'}`}>{d.status}</span></td><td>{ago(d.lastSeenAt)}</td></tr>)}
          </tbody></table></div>
        </div>
        <div className="card"><div className="card-header"><span className="card-title">OTA Agent</span></div>
          <div className="card-body" style={{fontSize:12}}>
            <div className="text-muted mb-2">Devices poll every 5 min:</div>
            <div className="mono" style={{background:'var(--bg)',padding:8,borderRadius:4,border:'1px solid var(--border)'}}>GET /api/fleet/:deviceId/pending</div>
          </div></div>
      </div>
    </div>
  );
}