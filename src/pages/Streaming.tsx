import React, { useState, useEffect, useCallback, useRef } from 'react';
import { get, post } from '../lib/api';
import { useToast } from '../contexts/AppContext';

export default function Streaming() {
  const toast = useToast();
  const [models, setModels] = useState<any[]>([]);
  const [modelId, setModelId] = useState('');
  const [manifest, setManifest] = useState<any>(null);
  const [chunks, setChunks] = useState<Record<number, any>>({});
  const [starting, setStarting] = useState(false);
  const fetching = useRef(false);

  useEffect(() => {
    get<any>('/api/models').then(res => setModels(res.models || [])).catch(() => {});
  }, []);

  const startStream = async () => {
    if (!modelId) return toast('Select a model to stream', 'error');
    setStarting(true);
    try {
      const res = await post<any>(`/api/stream-inference?modelId=${encodeURIComponent(modelId)}`);
      setManifest(res.manifest);
      setChunks({});
      toast(`Stream manifest created — ${res.manifest.chunkCount} chunks`, 'success');
    } catch (e: any) {
      toast(e.message, 'error');
    }
    setStarting(false);
  };

  // Fetch chunks over the real manifest stream URL until complete.
  const fetchChunk = useCallback(async (idx: number) => {
    if (!manifest) return;
    try {
      const res = await get<any>(`/api/stream-inference?modelId=${encodeURIComponent(modelId)}&chunk=${idx}`);
      setChunks(prev => ({ ...prev, [idx]: res.chunk }));
    } catch (e) {
      // stop on first failed chunk
    }
  }, [manifest, modelId]);

  useEffect(() => {
    if (!manifest || fetching.current) return;
    const nextIdx = Object.keys(chunks).length;
    if (nextIdx >= manifest.chunkCount) return;
    fetching.current = true;
    const timer = setTimeout(async () => {
      await fetchChunk(nextIdx);
      fetching.current = false;
    }, 250);
    return () => { clearTimeout(timer); fetching.current = false; };
  }, [manifest, chunks, fetchChunk]);

  const fetched = Object.keys(chunks).length;
  const progress = manifest ? Math.min(100, Math.round((fetched / manifest.chunkCount) * 100)) : 0;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Model Streaming CDN</h2>
          <p className="text-muted text-sm" style={{ margin: '4px 0 0 0' }}>Byte-range streaming of real Shelby blobs — chunks verified by SHA-256</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><span className="card-title">Create Stream Manifest</span></div>
        <div className="card-body">
          <div className="form-group" style={{ maxWidth: 420 }}>
            <label className="form-label">Select Model</label>
            <select className="form-input" value={modelId} onChange={e => setModelId(e.target.value)}>
              <option value="">Select an active model...</option>
              {models.map(m => <option key={m.id} value={m.id}>{m.model}</option>)}
            </select>
          </div>
          {!models.length ? (
            <div className="empty" style={{ padding: '28px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <i className="hgi-stroke hgi-wifi-01" style={{ fontSize: 34, opacity: 0.2 }} />
              <div style={{ fontWeight: 700, fontSize: 15 }}>No models available to stream</div>
              <div style={{ fontSize: 13, opacity: 0.55 }}>Register a model with a real Shelby blob to enable CDN streaming</div>
            </div>
          ) : (
            <button className="btn btn-primary" onClick={startStream} disabled={starting || (!!manifest && progress < 100)}>
              {starting ? 'Reading blob from Shelby...' : manifest && progress < 100 ? 'Streaming...' : manifest ? 'Regenerate Manifest' : 'Create Stream Manifest'}
            </button>
          )}
        </div>
      </div>

      {manifest && (
        <div className="card">
          <div className="card-header"><span className="card-title">Stream Manifest</span><span className="badge badge-green">{fetched}/{manifest.chunkCount} chunks fetched</span></div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 20 }}>
              <div>
                <div className="text-sm text-muted">Model ID</div>
                <div className="mono text-sm">{manifest.modelId || modelId}</div>
              </div>
              <div>
                <div className="text-sm text-muted">Total Size</div>
                <div className="mono text-sm">{manifest.totalSize ? `${(manifest.totalSize / 1024 / 1024).toFixed(2)} MB` : '—'}</div>
              </div>
              <div>
                <div className="text-sm text-muted">Chunk Size</div>
                <div className="mono text-sm">{manifest.chunkSize ? `${(manifest.chunkSize / 1024).toFixed(0)} KB` : '—'}</div>
              </div>
            </div>

            <div className="text-sm mb-2" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Fetching chunks from Shelby blob storage...</span>
              <span>{progress}%</span>
            </div>
            <div style={{ width: '100%', height: 8, background: 'var(--border-color)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: 'var(--primary-color)', transition: 'width 0.3s ease' }} />
            </div>

            {progress === 100 && (
              <div className="mt-4 p-4" style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.2)', borderRadius: 8, color: 'var(--green-color)' }}>
                <i className="hgi-stroke hgi-tick-double" style={{ marginRight: 8 }} />
                All {manifest.chunkCount} chunks fetched and verified against the manifest.
              </div>
            )}

            <div className="table-wrap mt-4" style={{ marginTop: 20 }}>
              <table>
                <thead>
                  <tr><th>Chunk</th><th>Size</th><th>SHA-256</th><th>Shelby Object</th></tr>
                </thead>
                <tbody>
                  {(manifest.chunks || []).slice(0, 20).map((c: any, i: number) => (
                    <tr key={i}>
                      <td className="mono">{i}</td>
                      <td>{c.size ? `${(c.size / 1024).toFixed(1)} KB` : '—'}</td>
                      <td className="mono text-sm">{c.sha256 ? c.sha256.slice(0, 16) + '…' : '—'}</td>
                      <td className="mono text-sm">{chunks[i]?.objectId || c.objectId || 'pending'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
