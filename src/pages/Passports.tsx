import React, { useEffect, useState, useRef } from 'react';
import { get, post } from '../lib/api';
import { useToast } from '../contexts/AppContext';

const CANARY_TEMPLATE = JSON.stringify([
  { canaryId: 'zero', output: { logits: [0.1, 0.2, 0.7] } },
  { canaryId: 'ones', output: { logits: [0.8, 0.1, 0.1] } },
  { canaryId: 'random_42', output: { logits: [0.05, 0.9, 0.05] } }
], null, 2);

export default function Passports() {
  const toast = useToast();
  const [models, setModels] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);   // passport detail
  const [checkResult, setCheckResult] = useState<any>(null);
  const [checking, setChecking] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Copy verifier state
  const [verifyModel, setVerifyModel] = useState<any>(null);
  const [outputsText, setOutputsText] = useState(CANARY_TEMPLATE);
  const [verdict, setVerdict] = useState<any>(null);
  const [verifying, setVerifying] = useState(false);

  const load = async () => {
    const m = await get<any>('/api/models').catch(() => ({ models: [] }));
    setModels(m.models || []);
  };
  useEffect(() => { load(); }, []);

  const viewPassport = async (modelId: string) => {
    setSelected(null);
    try {
      const res = await get<any>(`/api/passport/${encodeURIComponent(modelId)}`);
      setSelected(res.passport);
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const issue = async (modelId: string) => {
    try {
      const res = await post<any>('/api/passport', { modelId });
      setSelected(res.passport);
      toast(`Passport issued — anchored ${res.passport.anchored || 'locally'}`, 'success');
      load();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const checkFile = async () => {
    if (!file) return toast('Select a weights file to check', 'error');
    setChecking(true);
    try {
      const reader = new FileReader();
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });
      const res = await post<any>('/api/passport/check', { dataBase64 });
      setCheckResult(res);
      toast(res.match === 'exact' ? 'Match found — certificate valid' : 'No exact match found', res.match === 'exact' ? 'success' : 'error');
    } catch (e: any) {
      toast(e.message, 'error');
    }
    setChecking(false);
  };

  const runVerifyCopy = async () => {
    if (!verifyModel) return;
    let outputs;
    try {
      outputs = JSON.parse(outputsText);
    } catch {
      toast('Outputs must be valid JSON', 'error');
      return;
    }
    if (!Array.isArray(outputs) || !outputs.length) { toast('Provide at least one canary output', 'error'); return; }
    setVerifying(true);
    setVerdict(null);
    try {
      const res = await post<any>(`/api/passport/${encodeURIComponent(verifyModel.id)}/verify-copy`, { outputs });
      setVerdict(res.comparison);
    } catch (e: any) {
      toast(e.message, 'error');
    }
    setVerifying(false);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Model Passports</h2>
          <p className="text-muted text-sm" style={{ margin: '4px 0 0 0' }}>Public ownership certificates — prove a weights file is yours, or check any file's legal origin</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><span className="card-title">Check a weights file</span></div>
        <div className="card-body">
          <div className="flex gap-2 items-center" style={{ flexWrap: 'wrap' }}>
            <input ref={fileRef} type="file" className="form-input" style={{ maxWidth: 420 }} onChange={e => setFile(e.target.files?.[0] || null)} />
            <button className="btn btn-primary" onClick={checkFile} disabled={checking || !file}>
              {checking ? 'Hashing + looking up...' : 'Check Origin'}
            </button>
          </div>
          {checkResult && (
            <div className={`mt-4 p-4`} style={{
              marginTop: 16, padding: 14, borderRadius: 8, fontSize: 13, lineHeight: 1.6,
              background: checkResult.match === 'exact' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.08)',
              border: `1px solid ${checkResult.match === 'exact' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.25)'}`,
              color: 'var(--text-primary)',
            }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>
                {checkResult.match === 'exact' ? '✅ Registered model — certificate valid' : '⚠️ No exact match in the registry'}
              </div>
              <div className="text-sm text-muted" style={{ marginBottom: 8 }}>{checkResult.message}</div>
              <div className="mono text-sm" style={{ marginBottom: 8 }}>SHA-256: {checkResult.checkedSha256?.slice(0, 24)}…</div>
              {checkResult.match === 'exact' && checkResult.passport && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div><span className="text-muted">Model: </span><strong>{checkResult.passport.modelName}</strong></div>
                  <div><span className="text-muted">Registered: </span>{new Date(checkResult.passport.registeredAt).toLocaleString()}</div>
                  <div><span className="text-muted">Org: </span><span className="mono">{checkResult.passport.orgAddress ? checkResult.passport.orgAddress.slice(0, 16) + '…' : '—'}</span></div>
                  <div><span className="text-muted">Signature: </span>{checkResult.verified ? <span style={{ color: '#16a34a' }}>VALID ✓</span> : <span style={{ color: '#dc2626' }}>INVALID ✗</span>}</div>
                  {checkResult.passport.anchored && <div><span className="text-muted">Anchored: </span>{checkResult.passport.anchored}</div>}
                  {checkResult.passport.explorerUrl && <div><span className="text-muted">TX: </span><a href={checkResult.passport.explorerUrl} target="_blank" rel="noreferrer" className="mono text-sm">{checkResult.passport.txHash?.slice(0, 12)}…</a></div>}
                  <div><span className="text-muted">Behavioral fingerprints: </span>{checkResult.fingerprintCount || 0}</div>
                </div>
              )}
              {checkResult.match === 'none' && (
                <div className="text-sm text-muted">If this is your model, edit it — behavioral fingerprinting detects edits that SHA-256 alone misses.</div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><span className="card-title">Registered Models</span><button className="btn btn-sm" onClick={load}>↻</button></div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th>SHA-256</th>
                <th>Passport</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {!models.length ? (
                <tr><td colSpan={4}>
                  <div className="empty" style={{ padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <i className="hgi-stroke hgi-license" style={{ fontSize: 40, opacity: 0.2 }} />
                    <div style={{ fontWeight: 700, fontSize: 15 }}>No models registered</div>
                    <div style={{ fontSize: 13, opacity: 0.55 }}>Upload a model to get its passport issued automatically</div>
                  </div>
                </td></tr>
              ) : models.map(m => (
                <tr key={m.id}>
                  <td><strong>{m.model}</strong><br /><span className="text-sm text-muted">{m.id.slice(0, 12)}…</span></td>
                  <td className="mono text-sm">{m.sha256 ? m.sha256.slice(0, 20) + '…' : '—'}</td>
                  <td>{m.passportIssued ? <span className="badge badge-green"><i className="hgi-stroke hgi-tick-double" /> Issued</span> : <span className="badge badge-yellow">Pending</span>}</td>
                  <td>
                    <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                      <button className="btn btn-sm" onClick={() => viewPassport(m.id)}>View Passport</button>
                      {!m.passportIssued && <button className="btn btn-sm btn-primary" onClick={() => issue(m.id)}>Issue</button>}
                      <button className="btn btn-sm" style={{ color: 'var(--amber-color)' }} onClick={() => { setVerifyModel(m); setVerdict(null); setOutputsText(CANARY_TEMPLATE); }}>Verify Copy</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div className="card" style={{ marginBottom: 20, border: '1px solid rgba(20, 241, 149, 0.25)' }}>
          <div className="card-header">
            <span className="card-title">Passport — {selected.modelName}</span>
            <span className={`badge ${selected.verified ? 'badge-green' : 'badge-red'}`}>{selected.verified ? 'Signature VALID' : selected.signed ? 'Signature INVALID' : 'Unsigned'}</span>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><div className="text-sm text-muted">Model ID</div><div className="mono text-sm">{selected.modelId}</div></div>
              <div><div className="text-sm text-muted">Registered</div><div className="text-sm">{new Date(selected.registeredAt).toLocaleString()}</div></div>
              <div><div className="text-sm text-muted">SHA-256</div><div className="mono text-sm">{selected.sha256}</div></div>
              <div><div className="text-sm text-muted">Org Address</div><div className="mono text-sm">{selected.orgAddress || '—'}</div></div>
              <div><div className="text-sm text-muted">Anchored</div><div className="text-sm">{selected.anchored || '—'}</div></div>
              <div>
                <div className="text-sm text-muted">Shelby Certificate</div>
                <div className="mono text-sm">{selected.shelbyObjectId ? selected.shelbyObjectId.slice(0, 40) + '…' : '—'}</div>
              </div>
              {selected.txHash && <div><div className="text-sm text-muted">On-chain TX</div><a href={selected.explorerUrl} target="_blank" rel="noreferrer" className="mono text-sm">{selected.txHash.slice(0, 20)}…</a></div>}
              <div><div className="text-sm text-muted">Public Key</div><div className="mono text-sm">{selected.publicKey ? selected.publicKey.slice(0, 24) + '…' : '—'}</div></div>
            </div>
            {selected.signature && (
              <div style={{ marginTop: 12 }}>
                <div className="text-sm text-muted">Ed25519 Signature</div>
                <div className="mono text-sm" style={{ wordBreak: 'break-all' }}>{selected.signature}</div>
              </div>
            )}
            <button className="btn btn-sm" style={{ marginTop: 16 }} onClick={() => setSelected(null)}>Close</button>
          </div>
        </div>
      )}

      {verifyModel && (
        <div className="card" style={{ marginBottom: 20, border: '1px solid rgba(251, 191, 36, 0.3)' }}>
          <div className="card-header">
            <span className="card-title">Verify Deployment Copy — {verifyModel.model}</span>
            <span className="text-sm text-muted">Paste canary outputs from the suspect deployment</span>
          </div>
          <div className="card-body">
            <div className="form-group">
              <label className="form-label">Canary Outputs (JSON — {`{ canaryId, output }`} from the running model)</label>
              <textarea className="form-input mono" style={{ height: 160, fontFamily: 'var(--font-mono)', fontSize: 12 }} value={outputsText} onChange={e => setOutputsText(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <button className="btn btn-primary" onClick={runVerifyCopy} disabled={verifying}>{verifying ? 'Comparing fingerprints...' : 'Compare Against Registered Fingerprint'}</button>
              <button className="btn" onClick={() => setVerifyModel(null)}>Cancel</button>
            </div>
            {verdict && (
              <div style={{ marginTop: 16, padding: 14, borderRadius: 8, fontSize: 13, lineHeight: 1.6, background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 700, marginBottom: 8, color: verdict.match === 'exact' ? '#16a34a' : verdict.match === 'partial' ? '#d97706' : '#dc2626' }}>
                  {verdict.verdict}
                </div>
                <div className="text-sm text-muted">Divergence: {(verdict.divergenceScore * 100).toFixed(1)}%</div>
                {verdict.isSilentTamper && (
                  <div style={{ marginTop: 8, color: '#dc2626' }}>
                    <i className="hgi-stroke hgi-alert-01" style={{ marginRight: 6 }} />
                    {verdict.silentTamperExplanation} — this is an unlicensed or edited copy.
                  </div>
                )}
                {verdict.divergedCanaries?.length > 0 && (
                  <div className="mt-2 text-sm">
                    <div className="text-muted" style={{ marginBottom: 6 }}>Diverged canaries:</div>
                    {verdict.divergedCanaries.map((d: any, i: number) => (
                      <div key={i} className="mono text-xs" style={{ fontSize: 11, marginBottom: 2 }}>
                        {d.canaryId}: {d.originalHash} → {d.currentHash}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
