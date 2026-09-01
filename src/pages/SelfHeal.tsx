import React, { useEffect, useState } from 'react';
import { get, post, patch } from '../lib/api';
import { ago } from '../lib/utils';
import { useToast } from '../contexts/AppContext';

type Health = {
  total: number; healthy: number; tampered: number; healthPercent: string;
  needsHealing: any[]; evaluatedAt: string;
};
type Incident = {
  id: string; deviceId: string; modelId: string; type: string;
  oldSha256: string; newSha256: string; shelbyObjectId: string;
  tamperDetectedAt: string; healedAt: string | null;
  healDurationMs: number | null; status: string; autonomous: boolean;
};
type Stats = { incidents: number; healed: number; open: number; avgHealMs: number | null };

export default function SelfHeal() {
  const toast = useToast();
  const [health, setHealth] = useState<Health | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [stats, setStats] = useState<Stats>({ incidents: 0, healed: 0, open: 0, avgHealMs: null });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  // Attestation form — a device reports its running hash
  const [devices, setDevices] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [modelId, setModelId] = useState('');
  const [reportedSha, setReportedSha] = useState('');
  const [checkResult, setCheckResult] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    const [sh, d, m] = await Promise.all([
      get<any>('/api/selfheal').catch(() => null),
      get<any>('/api/devices').catch(() => ({ devices: [] })),
      get<any>('/api/models').catch(() => ({ models: [] })),
    ]);
    if (sh) { setHealth(sh.health || null); setIncidents(sh.incidents || []); setStats(sh.stats || { incidents: 0, healed: 0, open: 0, avgHealMs: null }); }
    setDevices(d.devices || []);
    setModels(m.models || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const runAttestation = async () => {
    if (!deviceId || !modelId || !reportedSha.trim()) { toast('Device, model and reported SHA-256 are required', 'error'); return; }
    setBusy('check');
    try {
      const r = await post<any>('/api/selfheal', { deviceId, modelId, reportedSha256: reportedSha.trim() });
      setCheckResult(r);
      toast(r.tampered ? 'Tamper detected — heal command issued' : 'Device integrity verified', r.tampered ? 'warning' : 'success');
      load();
    } catch (e: any) { toast(e.message, 'error'); }
    setBusy(null);
  };

  const confirmHeal = async (incidentId: string, verifiedSha256: string) => {
    setBusy(incidentId);
    try {
      const r = await patch<any>('/api/selfheal', { incidentId, verifiedSha256 });
      toast(r.message || 'Heal confirmed', 'success');
      load();
    } catch (e: any) { toast(e.message, 'error'); }
    setBusy(null);
  };

  if (loading) return <div className="page"><div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}><div className="spin" style={{ margin: '0 auto 12px' }} />Evaluating fleet integrity…</div></div>;

  const pct = parseFloat(health?.healthPercent || '100');
  const healthColor = pct >= 99 ? 'var(--green)' : pct >= 90 ? 'var(--amber)' : 'var(--red)';

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Explainer */}
      <div className="shelby-panel" style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '14px 18px' }}>
        <i className="hgi-stroke hgi-shield-energy" style={{ fontSize: 22, color: 'var(--coral)', marginTop: 2, flexShrink: 0 }} />
        <div>
          <strong style={{ fontSize: 13.5, display: 'block', marginBottom: 3 }}>Autonomous self-healing</strong>
          <span style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Devices attest the SHA-256 of the model they are actually running. On mismatch, Provenode halts activation,
            writes an on-chain incident, and issues a heal command pointing at the clean Shelby object — no human in the loop.
          </span>
        </div>
      </div>

      {/* Health stats */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Fleet integrity</div>
          <div className="stat-value" style={{ color: healthColor }}>{health?.healthPercent ?? '100'}%</div>
          <div className="stat-sub">{health?.healthy ?? 0} of {health?.total ?? 0} devices verified</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Needs healing</div>
          <div className="stat-value" style={{ color: (health?.tampered || 0) > 0 ? 'var(--red)' : 'var(--text-primary)' }}>{health?.tampered ?? 0}</div>
          <div className="stat-sub">digest mismatch detected</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Incidents healed</div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>{stats.healed}</div>
          <div className="stat-sub">{stats.open} open · {stats.incidents} total</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg heal time</div>
          <div className="stat-value">{stats.avgHealMs != null ? `${(stats.avgHealMs / 1000).toFixed(1)}s` : '—'}</div>
          <div className="stat-sub">detection to clean payload</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20 }} className="selfheal-cols">

        {/* Incident timeline */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Tamper incidents</span>
            <button className="btn btn-sm" onClick={load}><i className="hgi-stroke hgi-refresh" /> Refresh</button>
          </div>
          <div style={{ padding: 12 }}>
            {!incidents.length ? (
              <div className="empty" style={{ padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <i className="hgi-stroke hgi-shield-blockchain" style={{ fontSize: 40, opacity: 0.2 }} />
                <div style={{ fontWeight: 600, fontSize: 14.5 }}>No tamper incidents</div>
                <div style={{ fontSize: 12.5, opacity: 0.55, maxWidth: 380, textAlign: 'center' }}>
                  Every device attestation has matched its registered digest. Run an attestation on the right to test enforcement.
                </div>
              </div>
            ) : incidents.map(inc => {
              const healed = inc.status === 'healed';
              return (
                <div key={inc.id} className="card card-sm" style={{ marginBottom: 10, borderColor: healed ? 'var(--border)' : 'rgba(196,61,61,.35)' }}>
                  <div className="card-header" style={{ padding: '10px 14px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span className={`badge ${healed ? 'badge-green' : 'badge-red'}`}>
                        <i className={`hgi-stroke ${healed ? 'hgi-tick-01' : 'hgi-alert-02'}`} /> {healed ? 'HEALED' : 'HEAL ISSUED'}
                      </span>
                      <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{inc.deviceId}</span>
                      {inc.autonomous && <span className="badge badge-shelby" style={{ fontSize: 9.5 }}>AUTONOMOUS</span>}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{ago(inc.tamperDetectedAt)}</span>
                  </div>
                  <div className="card-body" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 11.5 }} className="incident-hashes">
                      <div>
                        <span className="form-label" style={{ marginBottom: 2 }}>Rejected digest</span>
                        <div className="mono" style={{ color: 'var(--red)', wordBreak: 'break-all' }}>{(inc.oldSha256 || '').slice(0, 24)}..</div>
                      </div>
                      <div>
                        <span className="form-label" style={{ marginBottom: 2 }}>Clean digest</span>
                        <div className="mono" style={{ color: 'var(--green)', wordBreak: 'break-all' }}>{(inc.newSha256 || '').slice(0, 24)}..</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                      Model <span className="mono">{inc.modelId}</span> · heal source{' '}
                      <span className="mono">{(inc.shelbyObjectId || '—').slice(0, 40)}</span>
                    </div>
                    {healed ? (
                      <div style={{ fontSize: 11.5, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <i className="hgi-stroke hgi-checkmark-circle-02" />
                        Healed {ago(inc.healedAt)}{inc.healDurationMs != null && ` in ${(inc.healDurationMs / 1000).toFixed(1)}s`}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11.5, color: 'var(--amber)' }}>Awaiting device confirmation</span>
                        <button className="btn btn-sm btn-success" style={{ marginLeft: 'auto' }} disabled={busy === inc.id} onClick={() => confirmHeal(inc.id, inc.newSha256)}>
                          {busy === inc.id ? <><span className="spin" /> Confirming</> : <><i className="hgi-stroke hgi-tick-double" /> Mark healed</>}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Attestation tester + devices needing heal */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <div className="card-header"><span className="card-title">Run device attestation</span></div>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label">Device</label>
                <select className="form-input" value={deviceId} onChange={e => setDeviceId(e.target.value)}>
                  <option value="">Select device</option>
                  {devices.map(d => <option key={d.id} value={d.id}>{d.id} · {d.location || 'unknown'}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Registered model</label>
                <select className="form-input" value={modelId} onChange={e => { setModelId(e.target.value); const m = models.find(x => x.id === e.target.value); if (m) setReportedSha(m.sha256 || m.hash || ''); }}>
                  <option value="">Select model</option>
                  {models.map(m => <option key={m.id} value={m.id}>{m.name} {m.version ? `v${m.version}` : ''}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">SHA-256 reported by device</label>
                <input className="form-input mono" value={reportedSha} onChange={e => setReportedSha(e.target.value)} placeholder="9e4a7c81d2bf…" />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Prefilled with the clean digest when you pick a model. Change a character to simulate tampering.
                </div>
              </div>
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy === 'check'} onClick={runAttestation}>
                {busy === 'check' ? <><span className="spin" /> Verifying</> : <><i className="hgi-stroke hgi-fingerprint-scan" /> Verify integrity</>}
              </button>

              {checkResult && (
                <div style={{
                  marginTop: 12, padding: 12, borderRadius: 8, fontSize: 12, lineHeight: 1.6,
                  background: checkResult.tampered ? 'var(--red-wash)' : 'var(--green-wash)',
                  color: checkResult.tampered ? 'var(--red)' : 'var(--green)',
                }}>
                  <strong style={{ display: 'block', marginBottom: 4 }}>
                    <i className={`hgi-stroke ${checkResult.tampered ? 'hgi-alert-02' : 'hgi-checkmark-circle-02'}`} style={{ marginRight: 5 }} />
                    {checkResult.message}
                  </strong>
                  {checkResult.healCommand && (
                    <pre className="mono" style={{ margin: '6px 0 0', fontSize: 10.5, whiteSpace: 'pre-wrap', color: 'inherit', opacity: 0.85 }}>
                      {JSON.stringify(checkResult.healCommand, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </div>

          {(health?.needsHealing?.length || 0) > 0 && (
            <div className="card">
              <div className="card-header"><span className="card-title" style={{ color: 'var(--red)' }}>Devices needing heal</span></div>
              <div style={{ padding: 12, display: 'grid', gap: 8 }}>
                {health!.needsHealing.map((d: any) => (
                  <div key={d.id} style={{ padding: '10px 12px', background: 'var(--red-wash)', borderRadius: 8, fontSize: 11.5 }}>
                    <div className="mono" style={{ fontWeight: 600, marginBottom: 3 }}>{d.id}</div>
                    <div style={{ color: 'var(--text-muted)' }}>{d.location || 'unknown'} · model {d.modelId}</div>
                    <div className="mono" style={{ marginTop: 4, color: 'var(--red)' }}>running {(d.currentSha256 || '').slice(0, 16)}..</div>
                    <div className="mono" style={{ color: 'var(--green)' }}>expected {(d.expectedSha256 || '').slice(0, 16)}..</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
