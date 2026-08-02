import React, { useState, useEffect } from 'react';
import { get, post } from '../lib/api';
import { fmt } from '../lib/utils';
import { useToast } from '../contexts/AppContext';

export default function Import() {
  const toast = useToast();
  const [repo, setRepo] = useState('');
  const [file, setFile] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);

  const loadJobs = async () => { const d = await get<any>('/api/import').catch(()=>({jobs:[]})); setJobs(d.jobs||[]); };
  useEffect(() => { loadJobs(); }, []);

  const doImport = async () => {
    if (!repo || !file) { toast('Repo and filename required.', 'error'); return; }
    setLoading(true);
    try {
      const data = await post<any>('/api/import', { source:'huggingface', repo, filename:file, name: name||undefined });
      setResult(data); toast(`Imported ${repo}/${file}`, 'success'); loadJobs();
    } catch (e:any) { toast(e.message, 'error'); }
    finally { setLoading(false); }
  };

  return (
    <div style={{maxWidth:760}}>
      <div className="card mb-4">
        <div className="card-header"><span className="card-title">Import from HuggingFace Hub → SHA-256 → Shelby</span></div>
        <div className="card-body">
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div className="form-group"><label className="form-label">Repo (owner/model)</label><input value={repo} onChange={e=>setRepo(e.target.value)} placeholder="ultralytics/yolov8n" /></div>
            <div className="form-group"><label className="form-label">Filename</label><input value={file} onChange={e=>setFile(e.target.value)} placeholder="yolov8n.onnx" /></div>
            <div className="form-group"><label className="form-label">Model name (optional)</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="YOLOv8n ONNX" /></div>
          </div>
          <button className="btn btn-primary" disabled={loading} onClick={doImport}>{loading?<span className="spin"/>:'Import Model'}</button>
          {result && <div style={{marginTop:14}}><div className="shelby-panel"><div className="shelby-panel-title">Import complete</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,fontSize:12}}>
              <div><div className="form-label">Model</div><strong>{result.job?.name}</strong></div>
              <div><div className="form-label">Mode</div><strong>{result.mode}</strong></div>
              <div><div className="form-label">SHA-256</div><span className="mono">{result.hash?.slice(0,16)}…</span></div>
              <div><div className="form-label">Size</div><span>{fmt(result.size)}</span></div>
            </div></div></div>}
        </div>
      </div>
      <div className="card"><div className="card-header"><span className="card-title">Import history</span><button className="btn btn-sm" onClick={loadJobs}>↻</button></div>
        <div className="table-wrap"><table><thead><tr><th>Repo</th><th>File</th><th>Status</th><th>Size</th></tr></thead>
        <tbody>{!jobs.length ? <tr><td colSpan={4} className="empty">No imports yet.</td></tr> :
          jobs.map(j => <tr key={j.id}><td>{j.repo||j.name}</td><td>{j.filename||'—'}</td>
            <td><span className={`badge ${j.status==='complete'?'badge-green':j.status==='failed'?'badge-red':'badge-amber'}`}>{j.status}</span></td>
            <td>{j.size?fmt(j.size):'—'}</td></tr>)}
        </tbody></table></div>
      </div>
    </div>
  );
}