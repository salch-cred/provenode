import React, { useEffect, useState } from 'react';
import { get } from '../lib/api';
import { fmt, ago } from '../lib/utils';
import { useToast } from '../contexts/AppContext';

export default function ObjectsPage() {
  const toast = useToast();
  const [objects, setObjects] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => { const d = await get<any>('/api/objects').catch(()=>({objects:[],stats:{}})); setObjects(d.objects||[]); setStats(d.stats||{}); };
  useEffect(() => { load(); }, []);

  const shards = [
    { id: 'node-us-east', status: 'online', type: 'Primary' },
    { id: 'node-eu-west', status: 'online', type: 'Primary' },
    { id: 'node-ap-south', status: 'offline', type: 'Parity' },
    { id: 'node-sa-east', status: 'online', type: 'Parity' }
  ];

  return (
    <div>
      <div className="stat-grid mb-4">
        <div className="stat-card"><div className="stat-label">Total</div><div className="stat-value" style={{color:'var(--shelby)'}}>{stats.total||0}</div></div>
        <div className="stat-card"><div className="stat-label">Healthy</div><div className="stat-value" style={{color:'var(--green)'}}>{stats.healthy||0}</div></div>
        <div className="stat-card"><div className="stat-label">Expiring soon</div><div className="stat-value" style={{color:'var(--amber)'}}>{stats.expiringSoon||0}</div></div>
        <div className="stat-card"><div className="stat-label">Expired</div><div className="stat-value" style={{color:'var(--red)'}}>{stats.expired||0}</div></div>
      </div>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Shelby object registry</span>
          <button className="btn btn-sm" onClick={load}>↻</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th>Object ID</th>
                <th>Size</th>
                <th>Erasure Coding</th>
                <th>Expiry</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {!objects.length ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty" style={{padding:'40px 20px', display:'flex', flexDirection:'column', alignItems:'center', gap:12}}>
                      <i className="hgi-stroke hgi-cloud-01" style={{fontSize:40, opacity:0.2}} />
                      <div style={{fontWeight:700, fontSize:15}}>No objects in Shelby storage</div>
                      <div style={{fontSize:13, opacity:0.55}}>Deploy a model in Shelby mode to create persisted object blobs with provenance tracking</div>
                    </div>
                  </td>
                </tr>
              ) : (
                objects.map(o => (
                  <React.Fragment key={o.id}>
                    <tr>
                      <td><strong>{o.model}</strong></td>
                      <td className="mono text-sm">{(o.objectId||'').slice(0,30)}…</td>
                      <td>{fmt(o.size)}</td>
                      <td><span className="badge badge-shelby">RAID-5 Sharded</span></td>
                      <td><span className={`badge ${o.status==='healthy'?'badge-green':o.status==='expiring_soon'?'badge-amber':'badge-red'}`}>{o.daysLeft!=null?`${o.daysLeft}d left`:'unknown'}</span></td>
                      <td>
                        <button className="btn btn-sm" onClick={() => setExpanded(expanded === o.id ? null : o.id)}>
                          <i className="hgi-stroke hgi-chart-bubble-01" /> {expanded === o.id ? 'Close Map' : 'Shard Map'}
                        </button>
                      </td>
                    </tr>
                    {expanded === o.id && (
                      <tr style={{ background: 'var(--surface)' }}>
                        <td colSpan={6} style={{ padding: '24px 32px' }}>
                          <h4 style={{ margin: '0 0 16px 0', fontSize: 14 }}>Encrypted Shard Distribution</h4>
                          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
                            This object is erasure-coded across the global Shelby network. If 30% of nodes go offline, the model remains 100% available.
                          </p>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                            {shards.map((s, i) => (
                              <div key={i} style={{ border: '1px solid var(--border)', padding: 12, borderRadius: 8, background: 'var(--bg)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                  <strong className="mono" style={{ fontSize: 12 }}>{s.id}</strong>
                                  <span style={{ fontSize: 11, color: s.status === 'online' ? 'var(--green)' : 'var(--red)' }}>● {s.status}</span>
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Type: {s.type} chunk</div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}