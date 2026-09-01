import React, { useState, useEffect } from 'react';
import { get, post } from '../lib/api';
import { useToast } from '../contexts/AppContext';

const VECTOR_TEMPLATE = JSON.stringify([
  { input: { prompt: 'sample input 1' }, output: 'class-a' },
  { input: { prompt: 'sample input 2' }, output: 'class-b' }
], null, 2);

export default function ZKValidator() {
  const toast = useToast();
  const [models, setModels] = useState<any[]>([]);
  const [modelId, setModelId] = useState('');
  const [vectorsText, setVectorsText] = useState(VECTOR_TEMPLATE);
  const [proof, setProof] = useState<any>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    get<any>('/api/models').then(res => {
      setModels(res.models || []);
      if (res.models?.[0]) setModelId(res.models[0].id);
    }).catch(() => {});
  }, []);

  const verify = async (mid: string) => {
    if (!mid) { setProof(null); return; }
    try {
      const res = await get<any>(`/api/zkproof/verify/${encodeURIComponent(mid)}`);
      setProof({ verified: res.verified, result: res.result });
    } catch (e: any) {
      setProof(null);
    }
  };

  useEffect(() => { verify(modelId); }, [modelId]);

  const generate = async () => {
    if (!modelId) return toast('Select a model first', 'error');
    let testVectors;
    try {
      testVectors = JSON.parse(vectorsText);
    } catch {
      toast('Test vectors must be valid JSON', 'error');
      return;
    }
    if (!Array.isArray(testVectors) || !testVectors.length) { toast('Provide at least one test vector', 'error'); return; }
    if (testVectors.some((v: any) => v.output === undefined)) {
      toast('Each test vector needs a real model output (v.output)', 'error');
      return;
    }
    setGenerating(true);
    try {
      await post<any>(`/api/zkproof/generate/${encodeURIComponent(modelId)}`, { testVectors });
      toast('Proof generated from real model outputs', 'success');
      verify(modelId);
    } catch (e: any) {
      toast(e.message, 'error');
    }
    setGenerating(false);
  };

  return (
    <div style={{ maxWidth: 860 }}>
      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <i className="hgi-stroke hgi-shield-02" style={{ color: 'var(--coral)' }} />
            <span className="card-title">ZK Execution Proofs</span>
          </div>
        </div>
        <div className="card-body">
          <p style={{ color: 'var(--text-muted)', marginBottom: 20, fontSize: 14 }}>
            A proof commits the model's SHA-256 to its real outputs on your test vectors. Proofs are stored on-chain-bound KV and verified with the circuit.
          </p>

          <div className="form-group" style={{ maxWidth: 420 }}>
            <label className="form-label">Model</label>
            <select className="form-input" value={modelId} onChange={e => setModelId(e.target.value)}>
              <option value="">Select a registered model...</option>
              {models.map(m => <option key={m.id} value={m.id}>{m.model}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Test Vectors (JSON — {`{ input, output }`} from real model runs)</label>
            <textarea className="form-input mono" style={{ height: 160, fontFamily: 'var(--font-mono)', fontSize: 12 }} value={vectorsText} onChange={e => setVectorsText(e.target.value)} />
          </div>

          <button className="btn btn-primary" onClick={generate} disabled={generating || !modelId}>
            {generating ? 'Generating proof...' : 'Generate Proof'}
          </button>

          <div className="card" style={{ marginTop: 24 }}>
            <div className="card-header"><span className="card-title">Proof Status — {modelId || 'no model'}</span></div>
            <div className="card-body">
              {proof ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    {proof.verified ? (
                      <span className="badge badge-green"><i className="hgi-stroke hgi-tick-01" style={{ marginRight: 4 }} /> Valid Proof</span>
                    ) : (
                      <span className="badge badge-red"><i className="hgi-stroke hgi-alert-01" style={{ marginRight: 4 }} /> Invalid</span>
                    )}
                  </div>
                  <pre style={{ background: 'var(--input-bg)', padding: 14, borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, overflowX: 'auto', color: 'var(--text-primary)' }}>
                    {JSON.stringify(proof.result, null, 2)}
                  </pre>
                </div>
              ) : (
                <div className="empty" style={{ padding: '24px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, opacity: 0.8 }}>
                  <i className="hgi-stroke hgi-shield-02" style={{ fontSize: 34, opacity: 0.2 }} />
                  <div style={{ fontSize: 13 }}>No proof yet for this model — generate one from real outputs.</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
