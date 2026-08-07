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
  const [tee, setTee] = useState('arm_trustzone');

  const load = async () => { const d = await get<any>('/api/devices').catch(()=>({devices:[]})); setDevices(d.devices||[]); };
  useEffect(() => { load(); }, []);

  const register = async () => {
    if (!id) { toast('Device ID required.','error'); return; }
    try { 
      await post('/api/devices', { deviceId:id, type, arch, location:loc, fleet, tee }); 
      toast(`Device ${id} registered with ${tee} attestation!`,'success'); 
      load(); 
      setShowForm(false); 
    }
    catch(e:any){ toast(e.message,'error'); }
  };

  const online = devices.filter(d=>d.status==='online').length;
  const secure = devices.filter(d=>d.tee && d.tee !== 'none').length;

  return (
    <div>
      <div className="stat-grid mb-4" style={{gridTemplateColumns:'repeat(3,1fr)'}}>
        <div className="stat-card"><div className="stat-label">Total Devices</div><div className="stat-value">{devices.length}</div></div>
        <div className="stat-card"><div className="stat-label">Online</div><div className="stat-value" style={{color:'var(--green)'}}>{online}</div></div>
        <div className="stat-card"><div className="stat-label">TEE Verified</div><div className="stat-value" style={{color:'var(--shelby)'}}>{secure}</div></div>
      </div>
      
      <div style={{display:'grid',gridTemplateColumns:'1fr 320px',gap:20}}>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Device inventory</span>
            <button className="btn btn-sm btn-primary" onClick={()=>setShowForm(s=>!s)}>+ Register</button>
          </div>
          
          {showForm && (
            <div style={{padding:16,borderBottom:'2px solid var(--border)'}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
                <div className="form-group"><label className="form-label">Device ID</label><input className="form-input" value={id} onChange={e=>setId(e.target.value)} placeholder="CAM-SIN-042" /></div>
                <div className="form-group"><label className="form-label">Type</label><select className="form-input" value={type} onChange={e=>setType(e.target.value)}><option>camera</option><option>drone</option><option>robot</option><option>vehicle</option></select></div>
                <div className="form-group"><label className="form-label">Architecture</label><select className="form-input" value={arch} onChange={e=>setArch(e.target.value)}><option>arm64</option><option>x64</option><option>armv7</option></select></div>
                <div className="form-group"><label className="form-label">Location</label><input className="form-input" value={loc} onChange={e=>setLoc(e.target.value)} placeholder="Singapore" /></div>
                <div className="form-group"><label className="form-label">Fleet</label><input className="form-input" value={fleet} onChange={e=>setFleet(e.target.value)} placeholder="production" /></div>
                <div className="form-group">
                  <label className="form-label">Hardware Enclave (TEE)</label>
                  <select className="form-input" value={tee} onChange={e=>setTee(e.target.value)}>
                    <option value="none">None (Standard)</option>
                    <option value="arm_trustzone">ARM TrustZone</option>
                    <option value="intel_sgx">Intel SGX</option>
                    <option value="apple_sep">Apple Secure Enclave</option>
                  </select>
                </div>
              </div>
              <div style={{ marginTop: 16 }}>
                <button className="btn btn-primary" onClick={register}>Register Secure Device</button>
              </div>
            </div>
          )}
          
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Device ID</th>
                  <th>Type</th>
                  <th>Location</th>
                  <th>Hardware Security</th>
                  <th>Status</th>
                  <th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {!devices.length ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="empty" style={{padding:'40px 20px', display:'flex', flexDirection:'column', alignItems:'center', gap:12}}>
                        <i className="hgi-stroke hgi-cpu" style={{fontSize:40, opacity:0.2}} />
                        <div style={{fontWeight:700, fontSize:15}}>No devices registered</div>
                        <div style={{fontSize:13, opacity:0.55}}>Register your first edge device to begin managing fleet deployments</div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  devices.map(d => (
                    <tr key={d.id}>
                      <td className="mono fw-700">{d.id}</td>
                      <td style={{textTransform:'capitalize'}}>{d.type}</td>
                      <td>{d.location}</td>
                      <td>
                        {d.tee && d.tee !== 'none' ? (
                          <span className="badge badge-shelby"><i className="hgi-stroke hgi-shield-02" style={{marginRight:4}} /> {d.tee === 'arm_trustzone' ? 'TrustZone' : d.tee === 'intel_sgx' ? 'Intel SGX' : 'Secure Enclave'}</span>
                        ) : (
                          <span className="badge" style={{opacity:0.6}}>Standard CPU</span>
                        )}
                      </td>
                      <td><span className={`badge ${d.status==='online'?'badge-green':'badge-amber'}`}>{d.status}</span></td>
                      <td style={{fontSize:12,opacity:0.7}}>{ago(d.lastSeenAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <div className="card-header"><span className="card-title">TEE Attestation</span></div>
            <div className="card-body" style={{fontSize:13, color: 'var(--text-muted)'}}>
              <p>Hardware Enclaves (TEE) ensure that AI models cannot be extracted from the physical device memory by an attacker.</p>
              <div style={{ marginTop: 12, padding: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
                <i className="hgi-stroke hgi-shield-tick" style={{ color: 'var(--shelby)', marginBottom: 8, fontSize: 18, display: 'block' }} />
                <strong>Strict Verification</strong><br/>
                Models are only decrypted inside the secure enclave after Aptos verifies the deployment signature.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}