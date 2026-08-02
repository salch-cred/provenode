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

  return (
    <div style={{display:'grid',gridTemplateColumns:'1fr 320px',gap:20,maxWidth:860}}>
      <div>
        <div className="card mb-4">
          <div className="card-header"><span className="card-title">Step 1 — Hash & register model</span></div>
          <div className="card-body">
            <div className="form-group"><label className="form-label">Model name</label>
              <input type="text" value={name} onChange={e=>setName(e.target.value)} placeholder="Vision Edge v2.5" /></div>
            <div className={`drop-zone ${dragOver?'drag-over':''}`}
              onClick={() => inputRef.current?.click()}
              onDragOver={e=>{e.preventDefault();setDragOver(true);}}
              onDragLeave={()=>setDragOver(false)}
              onDrop={e=>{e.preventDefault();setDragOver(false);if(e.dataTransfer.files[0])setFile(e.dataTransfer.files[0]);}}>
              <div className="drop-zone-icon"><i className="hgi-stroke hgi-cloud-upload" /></div>
              <div>{file ? file.name : 'Drop model file or click to browse'}</div>
              <div className="drop-zone-sub">ZIP, ONNX, TFLite, bin — up to 100 MB</div>
            </div>
            <input ref={inputRef} type="file" className="hidden" onChange={e=>e.target.files?.[0] && setFile(e.target.files[0])} />
            {file && <div style={{marginTop:10,padding:'8px 12px',background:'var(--bg)',border:'2px solid var(--border)',borderRadius:6,fontSize:12}}>
              <strong>{file.name}</strong><span className="text-muted" style={{marginLeft:8}}>{fmt(file.size)}</span></div>}
            <div style={{marginTop:12}}><button className="btn btn-primary" disabled={!file||uploading} onClick={doUpload}>
              {uploading ? <span className="spin" /> : 'Hash & Register'}</button></div>
            {result && (
              <div style={{marginTop:14}}><div className="shelby-panel"><div className="shelby-panel-title">Registration result</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,fontSize:12}}>
                  <div><div className="form-label">Model</div><strong>{name||file?.name}</strong></div>
                  <div><div className="form-label">Mode</div><span className={`badge ${result.mode==='shelby'?'badge-shelby':'badge-demo'}`}>{result.mode}</span></div>
                  <div><div className="form-label">SHA-256</div><span className="mono">{result.hash?.slice(0,16)}…</span></div>
                  <div><div className="form-label">Size</div><span>{fmt(result.size)}</span></div>
                </div></div></div>
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><span className="card-title">Step 2 — Deploy to fleet</span></div>
          <div className="card-body">
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div className="form-group"><label className="form-label">Region</label>
                <select value={region} onChange={e=>setRegion(e.target.value)}>
                  <option>Global</option><option>Asia-Pacific</option><option>Europe</option><option>Americas</option><option>Middle East</option>
                </select></div>
              <div className="form-group"><label className="form-label">Canary rollout</label>
                <div style={{display:'flex',alignItems:'center',gap:8,paddingTop:6}}>
                  <input type="checkbox" checked={canary} onChange={e=>setCanary(e.target.checked)} style={{width:'auto'}} />
                  <span className="text-sm">10%→25%→50%→100%</span></div></div>
            </div>
            <button className="btn btn-primary" disabled={!result||deploying} onClick={doDeploy}>
              {deploying ? <span className="spin" /> : 'Deploy to Fleet'}</button>
          </div>
        </div>
      </div>
      <div className="card"><div className="card-header"><span className="card-title">Trust path</span></div><div className="card-body">
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <TrustStep n={1} label="Provenode SHA-256" sub="Identity hash" done />
          <TrustStep n={2} label="Shelby on-chain object" sub="Immutable commitment" active />
          <TrustStep n={3} label="On-chain manifest" sub="Deployment proof" />
          <TrustStep n={4} label="Edge device verify" sub="SHA-256 check + activate" />
        </div></div></div>
    </div>
  );
}
function TrustStep({n,label,sub,done,active}:{n:number;label:string;sub:string;done?:boolean;active?:boolean}) {
  return <div className="flex gap-3"><div className={`step-circle ${done?'done':active?'active':''}`}>{n}</div>
    <div><div className="fw-700" style={{fontSize:12}}>{label}</div><div className="text-muted text-sm">{sub}</div></div></div>;
}