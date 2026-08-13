import React, { useState, useEffect, useCallback } from 'react';
import { get, post } from '../lib/api';
import { useToast } from '../contexts/AppContext';

export default function Federated() {
  const toast = useToast();
  const [models, setModels] = useState<any[]>([]);
  const [modelId, setModelId] = useState('');
  const [rounds, setRounds] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [merging, setMerging] = useState(false);

  // Gradient submission form (edge devices submit REAL trained gradients)
  const [deviceId, setDeviceId] = useState('');
  const [gradientHex, setGradientHex] = useState('');
  const [sampleCount, setSampleCount] = useState('100');
  const [roundNumber, setRoundNumber] = useState('1');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    get<any>('/api/models').then(res => {
      setModels(res.models || []);
      if (res.models?.[0]) setModelId(res.models[0].id);
    }).catch(() => {});
  }, []);

  const loadRounds = useCallback(async (mid: string) => {
    if (!mid) { setRounds([]); return; }
    setLoading(true);
    try {
      const res = await get<any>(`/api/federated?modelId=${encodeURIComponent(mid)}`);
      setRounds((res.rounds || []).sort((a: any, b: any) => (b.roundNumber || 0) - (a.roundNumber || 0)));
    } catch (e: any) {
      toast(e.message, 'error');
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { loadRounds(modelId); }, [modelId, loadRounds]);

  const submitGradient = async () => {
    if (!modelId) return toast('Select a model first', 'error');
    if (!deviceId.trim()) return toast('Device ID required', 'error');
    const hex = gradientHex.trim().replace(/^0x/i, '');
    if (!hex || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return toast('Gradient must be even-length hex bytes from a real training run', 'error');
    setSubmitting(true);
    try {
      const res = await post<any>('/api/federated', {
        modelId, deviceId: deviceId.trim(), gradientHex: hex,
        sampleCount: Number(sampleCount) || 100, roundNumber: Number(roundNumber) || 1,
      });
      toast(`Gradient anchored on Shelby — receipt ${res.receipt?.contributionId || res.receipt?.hash || 'stored'}`, 'success');
      setGradientHex('');
      loadRounds(modelId);
    } catch (e: any) {
      toast(e.message, 'error');
    }
    setSubmitting(false);
  };

  const triggerMerge = async (r: any) => {
    setMerging(true);
    try {
      const res = await post<any>('/api/federated/merge', { modelId, roundNumber: r.roundNumber });
      toast(`Global model merged — ${res.newHash?.slice(0, 16)}…`, 'success');
      loadRounds(modelId);
    } catch (e: any) {
      toast(e.message, 'error');
    }
    setMerging(false);
  };

  const selectedRound = rounds[0];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Federated Learning Coordinator</h2>
          <p className="text-muted text-sm" style={{ margin: '4px 0 0 0' }}>Aggregate real device gradients — every contribution is anchored on Shelby</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><span className="card-title">Global Model</span></div>
        <div className="card-body">
          <div className="form-group" style={{ maxWidth: 420 }}>
            <label className="form-label">Model</label>
            <select className="form-input" value={modelId} onChange={e => setModelId(e.target.value)}>
              <option value="">Select a registered model...</option>
              {models.map(m => <option key={m.id} value={m.id}>{m.model}</option>)}
            </select>
          </div>
          {!models.length && (
            <div className="empty" style={{ padding: '24px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <i className="hgi-stroke hgi-database-01" style={{ fontSize: 34, opacity: 0.2 }} />
              <div style={{ fontSize: 13, opacity: 0.6 }}>No registered models. Upload one first — FL rounds bind to a real on-chain model.</div>
            </div>
          )}
        </div>
      </div>

      {modelId && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><span className="card-title">Submit Device Gradient (real bytes)</span></div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Device ID</label>
                <input className="form-input" value={deviceId} onChange={e => setDeviceId(e.target.value)} placeholder="node_eu_1" />
              </div>
              <div className="form-group">
                <label className="form-label">Round #</label>
                <input className="form-input" type="number" min={1} value={roundNumber} onChange={e => setRoundNumber(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Sample Count</label>
                <input className="form-input" type="number" min={1} value={sampleCount} onChange={e => setSampleCount(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Gradient (hex bytes)</label>
                <input className="form-input mono" value={gradientHex} onChange={e => setGradientHex(e.target.value)} placeholder="a1b2c3d4… (from on-device training)" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }} />
              </div>
            </div>
            <button className="btn btn-primary" onClick={submitGradient} disabled={submitting}>
              {submitting ? 'Anchoring on Shelby...' : 'Submit Gradient to Shelby'}
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <span className="card-title">Rounds</span>
          {selectedRound && selectedRound.status !== 'aggregated' && (
            <button className="btn btn-sm btn-primary" onClick={() => triggerMerge(selectedRound)} disabled={merging || (selectedRound.contributions?.length || 0) < 2}>
              {merging ? 'Merging...' : `Trigger Merge (Round ${selectedRound.roundNumber})`}
            </button>
          )}
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Round</th>
                <th>Participants</th>
                <th>Status</th>
                <th>Round Hash (Shelby)</th>
                <th>Aggregated Object</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40 }}><div className="spin" /></td></tr>
              ) : !rounds.length ? (
                <tr><td colSpan={5}>
                  <div className="empty" style={{ padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <i className="hgi-stroke hgi-share-01" style={{ fontSize: 40, opacity: 0.2 }} />
                    <div style={{ fontWeight: 700, fontSize: 15 }}>No rounds yet</div>
                    <div style={{ fontSize: 13, opacity: 0.55 }}>Devices submit gradients for this model to begin a round</div>
                  </div>
                </td></tr>
              ) : rounds.map(r => (
                <tr key={r.roundHash || r.roundNumber}>
                  <td><strong>Round {r.roundNumber}</strong><br /><span className="text-sm text-muted">{r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}</span></td>
                  <td>{r.participantCount || (r.contributions || []).length}</td>
                  <td>
                    {r.status === 'aggregated'
                      ? <span className="badge badge-green"><i className="hgi-stroke hgi-tick-double" /> Aggregated</span>
                      : <span className="badge badge-yellow">Collecting ({r.contributions?.length || 0} gradients)</span>}
                  </td>
                  <td className="mono text-sm">{r.roundHash ? r.roundHash.slice(0, 16) + '…' : '—'}</td>
                  <td className="mono text-sm">{r.aggregatedObjectId || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {selectedRound && selectedRound.contributions?.length > 0 && (
          <div style={{ padding: 16 }}>
            <div className="text-sm text-muted mb-2">Latest round contributions</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {selectedRound.contributions.map((c: any, i: number) => (
                <span key={i} className="badge" style={{ background: 'var(--surface-hover)' }}>
                  <span className="mono">{c.deviceId}</span> · {c.sampleCount || '?'} samples
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
