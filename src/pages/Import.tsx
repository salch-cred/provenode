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

  const loadJobs = async () => { 
    const d = await get<any>('/api/import').catch(() => ({jobs:[]})); 
    setJobs(d.jobs || []); 
  };
  
  useEffect(() => { loadJobs(); }, []);

  const doImport = async () => {
    if (!repo || !file) { toast('Repo and filename required.', 'error'); return; }
    setLoading(true);
    try {
      const data = await post<any>('/api/import', { source:'huggingface', repo, filename:file, name: name||undefined });
      setResult(data); 
      toast(`Imported ${repo}/${file}`, 'success'); 
      loadJobs();
    } catch (e:any) { 
      toast(e.message, 'error'); 
    } finally { 
      setLoading(false); 
    }
  };

  return (
    <div style={{ maxWidth: 860 }}>
      <div className="card mb-4">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <i className="hgi-stroke hgi-cloud-download" style={{ color: 'var(--shelby)' }} />
            <span className="card-title">Import from HuggingFace Hub</span>
          </div>
        </div>
        <div className="card-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="stat-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Repo (owner/model)</label>
                <input 
                  className="form-input" 
                  value={repo} 
                  onChange={e => setRepo(e.target.value)} 
                  placeholder="ultralytics/yolov8n" 
                />
              </div>
              <div className="form-group">
                <label className="form-label">Filename</label>
                <input 
                  className="form-input" 
                  value={file} 
                  onChange={e => setFile(e.target.value)} 
                  placeholder="yolov8n.onnx" 
                />
              </div>
            </div>
            
            <div className="form-group">
              <label className="form-label">Model name (optional)</label>
              <input 
                className="form-input" 
                value={name} 
                onChange={e => setName(e.target.value)} 
                placeholder="YOLOv8n ONNX" 
              />
            </div>
          </div>
          
          <div style={{ marginTop: 24 }}>
            <button className="btn btn-primary" disabled={loading} onClick={doImport}>
              {loading ? <><span className="spin"/> Pulling from HF…</> : <><i className="hgi-stroke hgi-link-01" /> Import Model</>}
            </button>
          </div>
          
          {result && (
            <div style={{ marginTop: 20 }}>
              <div className="shelby-panel">
                <div className="shelby-panel-title">
                  <i className="hgi-stroke hgi-checkmark-circle-02" style={{ color: 'var(--green)', marginRight: 6 }} />
                  Import complete
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, fontSize: 12, marginTop: 12 }}>
                  <div>
                    <div className="form-label">Model</div>
                    <div style={{ fontWeight: 600 }}>{result.job?.name || repo}</div>
                  </div>
                  <div>
                    <div className="form-label">Mode</div>
                    <span className={`badge ${result.mode === 'shelby' ? 'badge-shelby' : 'badge-amber'}`}>{result.mode}</span>
                  </div>
                  <div>
                    <div className="form-label">SHA-256</div>
                    <span className="mono" style={{ fontWeight: 600 }}>{result.hash?.slice(0, 14)}…</span>
                  </div>
                  <div>
                    <div className="form-label">Size</div>
                    <span style={{ fontWeight: 600 }}>{fmt(result.size)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="card-title">Import history</span>
          <button className="btn btn-sm" onClick={loadJobs} aria-label="Refresh">
            <i className="hgi-stroke hgi-refresh" />
          </button>
        </div>
        
        {!jobs.length ? (
          <div className="empty" style={{ padding: '50px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <i className="hgi-stroke hgi-cloud-download" style={{ fontSize: 48, opacity: 0.15 }} />
            <div style={{ fontWeight: 700, fontSize: 15 }}>No models imported</div>
            <div style={{ fontSize: 13, opacity: 0.55 }}>Connect to HuggingFace Hub to pull models directly into Provenode</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Repo</th>
                  <th>File</th>
                  <th>Status</th>
                  <th>Size</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(j => (
                  <tr key={j.id}>
                    <td style={{ fontWeight: 500 }}>{j.repo || j.name}</td>
                    <td className="mono" style={{ fontSize: 12, opacity: 0.8 }}>{j.filename || '—'}</td>
                    <td>
                      <span className={`badge ${j.status === 'complete' ? 'badge-green' : j.status === 'failed' ? 'badge-red' : 'badge-amber'}`}>
                        {j.status}
                      </span>
                    </td>
                    <td style={{ fontWeight: 500 }}>{j.size ? fmt(j.size) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}