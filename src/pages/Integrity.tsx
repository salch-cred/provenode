import React, { useEffect, useState } from 'react';
import { get, post } from '../lib/api';
import { useToast } from '../contexts/AppContext';

export default function Integrity() {
  const toast = useToast();
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const scan = async () => {
    setLoading(true);
    try {
      const res = await post('/api/integrity/scan', {});
      setHealth(res.health);
      toast('Integrity scan complete', 'success');
    } catch (e: any) {
      toast(e.message, 'error');
    }
    setLoading(false);
  };

  const heal = async (deviceId: string, modelId: string) => {
    try {
      await post(`/api/integrity/heal/${deviceId}`, { modelId });
      toast(`Heal command sent to device ${deviceId}`, 'success');
      scan();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  useEffect(() => {
    scan();
    // Auto-scan every 10s for demo
    const interval = setInterval(scan, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Live Integrity Monitor</h2>
          <p className="text-muted text-sm" style={{ margin: '4px 0 0 0' }}>Continuous on-chain verification powered by Shelby Protocol</p>
        </div>
        <button className="btn btn-primary" onClick={scan} disabled={loading}>
          {loading ? 'Scanning...' : 'Force Scan'}
        </button>
      </div>

      {!health ? (
        <div className="card"><div className="card-body" style={{textAlign:'center',padding:40}}><div className="spin" /></div></div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
            <div className="card" style={{ padding: 16 }}>
              <div className="text-muted text-sm">Total Devices</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{health.total}</div>
            </div>
            <div className="card" style={{ padding: 16 }}>
              <div className="text-muted text-sm">Healthy</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--color-green)' }}>{health.healthy}</div>
            </div>
            <div className="card" style={{ padding: 16 }}>
              <div className="text-muted text-sm">Tampered</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: health.tampered > 0 ? 'var(--color-red)' : 'var(--color-fg)' }}>{health.tampered}</div>
            </div>
            <div className="card" style={{ padding: 16 }}>
              <div className="text-muted text-sm">Health Score</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{health.healthPercent}%</div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><span className="card-title">Active Alerts &amp; Healing</span></div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Device ID</th>
                    <th>Model</th>
                    <th>Status</th>
                    <th>Expected SHA</th>
                    <th>Reported SHA</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {!health.needsHealing?.length ? (
                    <tr><td colSpan={6}>
                      <div className="empty" style={{padding:'40px 20px', display:'flex', flexDirection:'column', alignItems:'center', gap:12}}>
                        <i className="hgi-stroke hgi-shield-check" style={{fontSize:40, opacity:0.3, color:'var(--color-green)'}} />
                        <div style={{fontWeight:700, fontSize:15}}>All devices passed integrity checks</div>
                        <div style={{fontSize:13, opacity:0.55}}>No SHA-256 mismatches detected across the fleet</div>
                      </div>
                    </td></tr>
                  ) : (
                    health.needsHealing.map((d: any) => (
                      <tr key={d.id} style={{ background: 'rgba(255, 0, 0, 0.05)' }}>
                        <td className="mono">{d.id}</td>
                        <td><strong>{d.modelId}</strong></td>
                        <td><span className="badge badge-red">Tampered</span></td>
                        <td className="mono text-sm text-green">{d.expectedSha256?.slice(0,12)}…</td>
                        <td className="mono text-sm text-red">{d.currentSha256?.slice(0,12)}…</td>
                        <td>
                          <button className="btn btn-sm btn-primary" onClick={() => heal(d.id, d.modelId)}>Auto-Heal</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
