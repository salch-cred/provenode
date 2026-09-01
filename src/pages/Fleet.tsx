import React, { useEffect, useState } from 'react';
import { get, post } from '../lib/api';
import { ago } from '../lib/utils';
import { useToast } from '../contexts/AppContext';

export default function Fleet() {
  const toast = useToast();
  const [devices, setDevices] = useState<any[]>([]);
  const [canaryDeps, setCanaryDeps] = useState<any[]>([]);
  const [bgConfigs, setBgConfigs] = useState<any[]>([]);
  const [deps, setDeps] = useState<any[]>([]);
  const [projectId, setProjectId] = useState('');
  const [name, setName] = useState('');
  const [blueId, setBlueId] = useState('');
  const [greenId, setGreenId] = useState('');

  const load = async () => {
    const [d, s, bg] = await Promise.all([
      get<any>('/api/devices').catch(() => ({ devices: [] })),
      get<any>('/api/status').catch(() => ({ deployments: [] })),
      get<any>('/api/bluegreen').catch(() => ({ configs: [] })),
    ]);
    setDevices(d.devices || []);
    setCanaryDeps((s.deployments || []).filter((x: any) => x.canary && x.status !== 'verified' && x.status !== 'rolled_back'));
    setDeps(s.deployments || []);
    setBgConfigs(bg.configs || []);
  };
  useEffect(() => { load(); }, []);

  const advance = async (id: string) => { try { await post(`/api/fleet/canary/${id}/advance`); toast('Advanced!', 'success'); load(); } catch (e: any) { toast(e.message, 'error'); } };
  const rollback = async (id: string) => { try { await post(`/api/fleet/canary/${id}/rollback`); toast('Rolled back.', 'warning'); load(); } catch (e: any) { toast(e.message, 'error'); } };

  const createBg = async () => {
    if (!projectId || !name) { toast('Project ID and name required', 'error'); return; }
    try { await post('/api/bluegreen', { projectId, name, blueDeploymentId: blueId, greenDeploymentId: greenId }); toast('Blue-green config created', 'success'); load(); }
    catch (e: any) { toast(e.message, 'error'); }
  };
  const switchSlot = async (pid: string) => {
    try { const d = await post<any>('/api/bluegreen/switch', { projectId: pid }); toast(`Switched to ${d.switched.to.toUpperCase()}`, 'success'); load(); }
    catch (e: any) { toast(e.message, 'error'); }
  };

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* OTA fleet status */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Fleet OTA status</span>
          <button className="btn btn-sm" onClick={load}><i className="hgi-stroke hgi-refresh" /></button>
        </div>
        <div className="table-wrap"><table><thead><tr><th>Device</th><th>Location</th><th>Status</th><th>Last seen</th></tr></thead>
          <tbody>{!devices.length ? <tr><td colSpan={4}>
            <div className="empty" style={{ padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <i className="hgi-stroke hgi-wifi-off-01" style={{ fontSize: 40, opacity: 0.2 }} />
              <div style={{ fontWeight: 600, fontSize: 15 }}>No devices in fleet</div>
              <div style={{ fontSize: 13, opacity: 0.55 }}>Register edge devices first to track OTA deployment status</div>
            </div>
          </td></tr> :
            devices.map(d => <tr key={d.id}><td className="mono fw-700">{d.id}</td><td>{d.location}</td>
              <td><span className={`badge ${d.status === 'online' ? 'badge-green' : 'badge-amber'}`}>{d.status}</span></td><td>{ago(d.lastSeenAt)}</td></tr>)}
          </tbody></table></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }} className="fleet-two-col">

        {/* Canary */}
        <div className="card">
          <div className="card-header"><span className="card-title">Active canary rollouts</span></div>
          <div style={{ padding: 12 }}>
            {!canaryDeps.length ? (
              <div className="empty" style={{ padding: '32px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <i className="hgi-stroke hgi-git-branch" style={{ fontSize: 36, opacity: 0.2 }} />
                <div style={{ fontWeight: 600, fontSize: 14 }}>No active canaries</div>
                <div style={{ fontSize: 12.5, opacity: 0.55 }}>Start a canary rollout from the deploy page</div>
              </div>
            ) : canaryDeps.map(d => {
              const stages = d.canary.stages; const cur = d.canary.currentStage;
              return <div className="card card-sm" style={{ marginBottom: 12 }} key={d.id}>
                <div className="card-header"><span className="card-title">{d.model}</span><span className="badge badge-blue">canary {stages[cur]}%</span></div>
                <div className="card-body" style={{ padding: 12 }}>
                  <div className="flex gap-2 mb-2">{stages.map((s: number, i: number) => <span key={i} className={`badge ${i < cur ? 'badge-green' : i === cur ? 'badge-blue' : 'badge-demo'}`}>{s}%</span>)}</div>
                  <div className="flex gap-2"><button className="btn btn-sm btn-primary" onClick={() => advance(d.id)}>Advance</button><button className="btn btn-sm btn-danger" onClick={() => rollback(d.id)}>Rollback</button></div>
                </div></div>;
            })}
          </div>
        </div>

        {/* Blue-Green */}
        <div className="card">
          <div className="card-header"><span className="card-title">Blue-Green cutover</span></div>
          <div style={{ padding: 12 }}>
            {!bgConfigs.length ? (
              <div className="empty" style={{ padding: '32px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <i className="hgi-stroke hgi-shuffle" style={{ fontSize: 36, opacity: 0.2 }} />
                <div style={{ fontWeight: 600, fontSize: 14 }}>No blue-green configs</div>
                <div style={{ fontSize: 12.5, opacity: 0.55 }}>Configure two slots below for zero-downtime atomic cutover</div>
              </div>
            ) : bgConfigs.map(c => (
              <div className="card card-sm mb-3" key={c.projectId}>
                <div className="card-header"><span className="card-title">{c.name}</span><span className={`badge ${c.activeSlot === 'blue' ? 'badge-blue' : 'badge-green'}`}>ACTIVE: {c.activeSlot.toUpperCase()}</span></div>
                <div className="card-body" style={{ padding: 12 }}>
                  <div className="flex gap-4 text-sm mb-3">
                    <div><span className="form-label">Blue</span><div className="mono">{(c.blueDeploymentId || '—').slice(0, 12)}..</div></div>
                    <div><span className="form-label">Green</span><div className="mono">{(c.greenDeploymentId || '—').slice(0, 12)}..</div></div>
                  </div>
                  <button className="btn btn-sm btn-primary" onClick={() => switchSlot(c.projectId)}><i className="hgi-stroke hgi-shuffle" /> Switch Active Slot</button>
                  {c.history?.length > 0 && <div className="text-muted text-sm" style={{ marginTop: 8 }}>Last switch: {ago(c.history[0]?.at)}</div>}
                </div>
              </div>
            ))}
            {/* Create config form */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 8 }} className="bg-form">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input className="form-input" value={projectId} onChange={e => setProjectId(e.target.value)} placeholder="Project ID (vision-edge-prod)" />
                <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Config name" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <select className="form-input" value={blueId} onChange={e => setBlueId(e.target.value)}>
                  <option value="">Blue deployment</option>
                  {deps.map(d => <option key={d.id} value={d.id}>{d.model} v{d.version}</option>)}
                </select>
                <select className="form-input" value={greenId} onChange={e => setGreenId(e.target.value)}>
                  <option value="">Green deployment</option>
                  {deps.map(d => <option key={d.id} value={d.id}>{d.model} v{d.version}</option>)}
                </select>
              </div>
              <button className="btn btn-sm" onClick={createBg}><i className="hgi-stroke hgi-add-01" /> Save blue-green config</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
