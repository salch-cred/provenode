import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { upload as apiUpload, post } from '../lib/api';
import { fmt } from '../lib/utils';
import { useToast } from '../contexts/AppContext';

export default function Deploy() {
  const toast = useToast();
  const nav = useNavigate();
  const [file, setFile] = useState<File|null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [deploying, setDeploying] = useState(false);
  const [region, setRegion] = useState('Global');
  const [canary, setCanary] = useState(false);
  const [name, setName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const doUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (name) fd.append('name', name);
      const data = await apiUpload<any>('/api/upload', fd);
      setResult(data);
      toast(`Registered in ${data.mode} mode.`, 'success');
    } catch (e:any) { toast(e.message, 'error'); }
    finally { setUploading(false); }
  };

  const doDeploy = async () => {
    if (!result) return;
    setDeploying(true);
    try {
      const data = await post<any>('/api/deploy', { modelId: result.id, region, canary });
      toast(`Deployment started${canary?' (canary)':''} — ${data.manifest.id.slice(0,8)}`, 'success');
      nav('/app/dashboard');
    } catch (e:any) { toast(e.message, 'error'); }
    finally { setDeploying(false); }
  };

  const step1Done = !!result;
  const step2Active = !!result;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'start' }}>

      {/* ── Left Column ──────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Step 1 */}
        <div className="card">
          <div className="card-header" style={{ paddingBottom: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: step1Done ? 'var(--green)' : 'var(--coral)',
                color: '#fff', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontWeight: 500, fontSize: 12.5, fontFamily: 'var(--font-mono)'
              }}>1</div>
              <span className="card-title">Hash & register model</span>
              {step1Done && <span className="badge badge-green" style={{ marginLeft: 'auto' }}>
                <i className="hgi-stroke hgi-checkmark-circle-02" /> Registered
              </span>}
            </div>
          </div>
          <div className="card-body" style={{ paddingTop: 16 }}>
            <div className="form-group">
              <label className="form-label">Model name</label>
              <input
                type="text" value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Vision Edge v2.5"
                style={{ width: '100%' }}
              />
            </div>

            <div
              role="button"
              tabIndex={0}
              aria-label="Choose a model file to upload"
              className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
              onClick={() => inputRef.current?.click()}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); }}
              style={{ cursor: 'pointer' }}
            >
              <div className="drop-zone-icon">
                <i className={`hgi-stroke ${file ? 'hgi-file-01' : 'hgi-cloud-upload'}`}
                   style={{ color: file ? 'var(--green)' : undefined }} />
              </div>
              <div style={{ fontWeight: 600 }}>
                {file ? file.name : 'Drop model file or click to browse'}
              </div>
              <div className="drop-zone-sub">
                {file
                  ? <span style={{ color: 'var(--green)' }}>{fmt(file.size)} · ready to register</span>
                  : 'ZIP, ONNX, TFLite, bin — up to 100 MB'}
              </div>
            </div>
            <input ref={inputRef} type="file" className="hidden"
              onChange={e => e.target.files?.[0] && setFile(e.target.files[0])} />

            <div style={{ marginTop: 16 }}>
              <button className="btn btn-primary" disabled={!file || uploading} onClick={doUpload}
                style={{ width: '100%', justifyContent: 'center' }}>
                {uploading
                  ? <><span className="spin" /> Hashing & anchoring to Shelby…</>
                  : <><i className="hgi-stroke hgi-shield-blockchain" /> Hash & Register</>}
              </button>
            </div>

            {result && (
              <div style={{ marginTop: 16 }}>
                <div className="shelby-panel">
                  <div className="shelby-panel-title">Registration result</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 10 }}>
                    <ResultField label="Model" value={name || file?.name || '—'} />
                    <ResultField label="SHA-256" value={`${result.hash?.slice(0,14)}…`} mono />
                    <ResultField label="Size" value={fmt(result.size)} />
                    <ResultField label="Mode" value={
                      <span className={`badge ${result.mode==='shelby'?'badge-shelby':'badge-amber'}`}>{result.mode}</span>
                    } />
                    {result.objectId && <ResultField label="Object ID" value={`${result.objectId?.slice(0,18)}…`} mono />}
                    {result.aptosHash && <ResultField label="Aptos TX" value={`${result.aptosHash?.slice(0,12)}…`} mono />}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Step 2 */}
        <div className="card" style={{ opacity: step2Active ? 1 : 0.5 }}>
          <div className="card-header" style={{ paddingBottom: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: step2Active ? 'var(--coral)' : 'var(--surface-hover)',
                border: '1px solid var(--border-strong)',
                color: step2Active ? '#fff' : 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 500, fontSize: 12.5, fontFamily: 'var(--font-mono)'
              }}>2</div>
              <span className="card-title">Deploy to fleet</span>
              {!step2Active && <span style={{ fontSize: 12, opacity: 0.5, marginLeft: 'auto' }}>Complete step 1 first</span>}
            </div>
          </div>
          <div className="card-body" style={{ paddingTop: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Target region</label>
                <select value={region} onChange={e => setRegion(e.target.value)} disabled={!step2Active}>
                  <option>Global</option>
                  <option>Asia-Pacific</option>
                  <option>Europe</option>
                  <option>Americas</option>
                  <option>Middle East</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Canary rollout</label>
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', border: '1px solid var(--border-strong)',
                  borderRadius: 6, cursor: step2Active ? 'pointer' : 'default',
                  background: canary ? 'var(--coral-wash)' : 'transparent',
                  borderColor: canary ? 'var(--coral)' : 'var(--border-strong)',
                  transition: 'background .2s, border-color .2s'
                }}>
                  <input type="checkbox" checked={canary} onChange={e => setCanary(e.target.checked)}
                    disabled={!step2Active} style={{ width: 'auto' }} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>Phased rollout</div>
                    <div style={{ fontSize: 11, opacity: 0.55 }}>10% → 25% → 50% → 100%</div>
                  </div>
                </label>
              </div>
            </div>
            <button className="btn btn-primary" disabled={!result || deploying} onClick={doDeploy}
              style={{ width: '100%', justifyContent: 'center' }}>
              {deploying
                ? <><span className="spin" /> Broadcasting to fleet…</>
                : <><i className="hgi-stroke hgi-rocket-01" /> Deploy to Fleet</>}
            </button>
          </div>
        </div>
      </div>

      {/* ── Right Column: Trust Path ──────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 24 }}>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Cryptographic trust path</span>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              <TrustStep n={1} icon="hgi-fingerprint-scan" label="Provenode SHA-256" sub="Local identity hash computed from model bytes" done={step1Done} active={!step1Done} />
              <TrustStep n={2} icon="hgi-package" label="Shelby on-chain object" sub="Immutable commitment anchored to Shelbynet" done={step1Done} active={false} />
              <TrustStep n={3} icon="hgi-blockchain-01" label="Aptos L1 manifest" sub="On-chain deployment proof written to Move contract" done={false} active={step2Active} />
              <TrustStep n={4} icon="hgi-cpu" label="Edge device verify" sub="SHA-256 check against on-chain hash before activation" done={false} active={false} last />
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <i className="hgi-stroke hgi-shield-02" style={{ color: 'var(--green)', fontSize: 18 }} />
            <span style={{ fontWeight: 700, fontSize: 13 }}>Compliance coverage</span>
          </div>
          {[
            { label: 'EU AI Act Art. 13', check: true },
            { label: 'GDPR model lineage', check: true },
            { label: 'ISO/IEC 42001 audit trail', check: true },
            { label: 'NIST AI RMF provenance', check: true },
          ].map(r => (
            <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid #F2EFE9', fontSize: 12.5 }}>
              <i className="hgi-stroke hgi-checkmark-circle-02" style={{ color: 'var(--green)', fontSize: 14 }} />
              <span>{r.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TrustStep({ n, icon, label, sub, done, active, last }: {
  n: number; icon: string; label: string; sub: string;
  done?: boolean; active?: boolean; last?: boolean;
}) {
  const bg = done ? 'var(--green)' : active ? 'var(--coral)' : 'var(--surface-hover)';
  const textColor = done || active ? '#fff' : 'var(--text-muted)';
  return (
    <div style={{ display: 'flex', gap: 14, paddingBottom: last ? 0 : 16, position: 'relative' }}>
      {!last && (
        <div style={{
          position: 'absolute', left: 13, top: 28, bottom: 0,
          width: 1.5, background: done ? 'var(--green)' : 'var(--border)'
        }} />
      )}
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: bg, color: textColor,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 800, fontSize: 12, zIndex: 1
      }}>
        {done ? <i className="hgi-stroke hgi-tick-02" style={{ fontSize: 14 }} /> : n}
      </div>
      <div style={{ paddingTop: 3 }}>
        <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className={`hgi-stroke ${icon}`} style={{ fontSize: 14, opacity: 0.6 }} />
          {label}
        </div>
        <div style={{ fontSize: 12, opacity: 0.55, marginTop: 2 }}>{sub}</div>
      </div>
    </div>
  );
}

function ResultField({ label, value, mono }: { label: string; value: any; mono?: boolean }) {
  return (
    <div>
      <div className="form-label">{label}</div>
      <div style={{ fontFamily: mono ? 'var(--font-mono)' : undefined, fontSize: 12, fontWeight: 600 }}>{value}</div>
    </div>
  );
}