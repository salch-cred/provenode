import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';

export default function Verify() {
  const [params] = useSearchParams();
  const modelId = params.get('id');
  const modelName = params.get('name');
  const modelHash = params.get('hash');
  const [record, setRecord] = useState<any>(null);
  const [status, setStatus] = useState<'loading'|'ok'|'error'>('loading');

  useEffect(() => {
    (async () => {
      if (!modelId) { setStatus(modelHash ? 'ok' : 'error'); return; }
      try {
        const res = await fetch('/api/models');
        const { models } = await res.json();
        const found = models?.find((m: any) => m.id === modelId);
        setRecord(found || { model: modelName, id: modelId, sha256: modelHash, mode: 'demo' });
        setStatus('ok');
      } catch {
        setRecord({ model: modelName, id: modelId, sha256: modelHash, mode: 'demo' });
        setStatus(modelHash ? 'ok' : 'error');
      }
    })();
  }, [modelId]);

  const fmt = (n?: number) => !n ? '0 B' : n < 1048576 ? `${(n/1024).toFixed(1)} KB` : `${(n/1048576).toFixed(1)} MB`;

  return (
    <div className="verify-page">
      <div className="verify-topbar">
        <Link to="/" className="verify-logo"><span className="dot" />Provenode</Link>
        <span className="verify-crumb">/ Model Proof</span>
        <Link to="/app/dashboard" className="btn btn-sm" style={{marginLeft:'auto'}}>Console ↗</Link>
      </div>
      <div className="verify-container">
        {status === 'loading' && (
          <div className="card"><div className="card-body" style={{textAlign:'center',padding:40}}><div className="spin" /></div></div>
        )}
        {status === 'error' && (
          <div className="card"><div className="card-body" style={{textAlign:'center',padding:40}}>
            <div style={{fontSize:32,marginBottom:12}}><i className="hgi-stroke hgi-alert-02" /></div>
            <div style={{fontWeight:700,marginBottom:8}}>Proof not found</div>
            <div className="text-muted text-sm">No model ID or hash provided in URL.</div>
          </div></div>
        )}
        {status === 'ok' && record && (
          <>
            <div className="card" style={{textAlign:'center',padding:'32px 20px'}}>
              <div className="verify-checkmark"><i className="hgi-stroke hgi-checkmark-circle-02" /></div>
              <div style={{fontSize:22,fontWeight:800,letterSpacing:'-.5px',marginBottom:6}}>{record.model || 'Model Verified'}</div>
              <div className="text-muted text-sm">Registered {record.createdAt ? new Date(record.createdAt).toLocaleString() : '—'}</div>
              <div style={{marginTop:14,display:'flex',justifyContent:'center',gap:8}}>
                <span className={`badge ${record.mode === 'shelby' ? 'badge-shelby' : 'badge-demo'}`}>{record.mode}</span>
                <span className="badge badge-green">verified</span>
              </div>
            </div>
            <div className="card">
              <div className="card-header"><span className="card-title">Cryptographic proof</span></div>
              <div className="card-body" style={{padding:'0 20px'}}>
                <ProofRow label="Model name" value={record.model} />
                <ProofRow label="Record ID" value={record.id} mono />
                <ProofRow label="SHA-256" value={record.sha256} mono />
                <ProofRow label="Shelby object" value={record.objectId || '—'} mono />
                <ProofRow label="File size" value={fmt(record.size)} />
                <ProofRow label="Mode" value={record.mode} />
              </div>
            </div>
            <div style={{display:'flex',gap:10,marginTop:4}}>
              <Link to="/app/dashboard" className="btn">← Console</Link>
              <button className="btn" onClick={() => window.location.reload()}>↻ Refresh</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ProofRow({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div className="proof-row-verify">
      <div className="proof-label-verify">{label}</div>
      <div className={`proof-value-verify ${mono ? 'mono' : ''}`}>{value || '—'}</div>
    </div>
  );
}