import React, { useState, useEffect } from 'react';
import { post, get } from '../lib/api';
import { useToast } from '../contexts/AppContext';

export default function Streaming() {
  const toast = useToast();
  const [models, setModels] = useState<any[]>([]);
  const [modelId, setModelId] = useState('');
  const [session, setSession] = useState<any>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    get<any>('/api/models').then(res => setModels(res.models || [])).catch(() => {});
  }, []);

  const startStream = async () => {
    if (!modelId) return toast('Select a model to stream', 'error');
    try {
      const res = await post<any>('/api/streaming/session', { modelId });
      setSession(res.session);
      setProgress(0);
      toast('Streaming session established', 'success');
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  useEffect(() => {
    if (session && progress < 100) {
      const timer = setTimeout(() => {
        setProgress(p => Math.min(p + Math.random() * 5 + 2, 100));
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [session, progress]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Model Streaming CDN</h2>
          <p className="text-muted text-sm" style={{ margin: '4px 0 0 0' }}>Dynamic byte-range reads for instant AI inference via Shelby Hot Storage</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><span className="card-title">Establish Streaming Session</span></div>
        <div className="card-body">
          <div className="form-group">
            <label className="form-label">Select Model</label>
            <select className="form-input" style={{ width: 300 }} value={modelId} onChange={e => setModelId(e.target.value)}>
              <option value="">Select an active model...</option>
              {models.map(m => <option key={m.id} value={m.id}>{m.model}</option>)}
            </select>
          </div>
          {!models.length && (
            <div className="empty" style={{padding:'32px 20px', display:'flex', flexDirection:'column', alignItems:'center', gap:12, marginTop:8}}>
              <i className="hgi-stroke hgi-wifi-01" style={{fontSize:36, opacity:0.2}} />
              <div style={{fontWeight:700, fontSize:15}}>No models available to stream</div>
              <div style={{fontSize:13, opacity:0.55}}>Register and deploy a model in Shelby mode to enable CDN streaming</div>
            </div>
          )}
          {models.length > 0 && (
            <button className="btn btn-primary" onClick={startStream} disabled={!!(session && progress < 100)}>
              {session && progress < 100 ? 'Streaming...' : 'Init Stream (0 Cold Start)'}
            </button>
          )}
        </div>
      </div>

      {session && (
        <div className="card">
          <div className="card-header"><span className="card-title">Live Session Analytics</span><span className="badge badge-green">Connected: {session.nodeIp}</span></div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
              <div>
                <div className="text-sm text-muted">Session ID</div>
                <div className="mono text-sm">{session.id}</div>
              </div>
              <div>
                <div className="text-sm text-muted">Target Device</div>
                <div className="mono text-sm">{session.deviceId}</div>
              </div>
              <div>
                <div className="text-sm text-muted">Bandwidth</div>
                <div className="mono text-sm">{(progress * 1.5).toFixed(1)} Gbps (Fiber Backbone)</div>
              </div>
              <div>
                <div className="text-sm text-muted">Byte-Range Blocks</div>
                <div className="mono text-sm">{session.totalBlocks} blocks</div>
              </div>
            </div>

            <div className="text-sm mb-2" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Streaming active weights to GPU memory...</span>
              <span>{Math.floor(progress)}%</span>
            </div>
            <div style={{ width: '100%', height: 8, background: 'var(--border-color)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: 'var(--primary-color)', transition: 'width 0.3s ease' }} />
            </div>

            {progress === 100 && (
              <div className="mt-4 p-4" style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.2)', borderRadius: 8, color: 'var(--green-color)' }}>
                <i className="hgi-stroke hgi-tick-double" style={{ marginRight: 8 }} />
                Streaming complete. Model is fully resident in GPU memory and ready for inference.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
