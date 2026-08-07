import React, { useState } from 'react';
import { post } from '../lib/api';
import { useToast } from '../contexts/AppContext';

export default function Distillation() {
  const toast = useToast();
  const [teacherId, setTeacherId] = useState('');
  const [studentArch, setStudentArch] = useState('mobilenet-v3');
  const [temperature, setTemperature] = useState(4);
  const [epochs, setEpochs] = useState(10);
  const [running, setRunning] = useState(false);
  const [jobs, setJobs] = useState<any[]>([]);

  const start = async () => {
    if (!teacherId) { toast('Teacher model ID required', 'error'); return; }
    setRunning(true);
    try {
      const res = await post<any>('/api/distillation', { teacherId, studentArch, temperature, epochs });
      setJobs(prev => [{ id: res.jobId || Math.random().toString(36).slice(2,8), teacherId, studentArch, temperature, epochs, status: 'running', progress: 0, createdAt: new Date().toISOString() }, ...prev]);
      toast('Distillation job started', 'success');
      setTeacherId('');
    } catch (e: any) {
      toast(e.message, 'error');
    }
    setRunning(false);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Distillation jobs</span>
          <span className="badge badge-shelby"><i className="hgi-stroke hgi-ai-chip-01" style={{ marginRight: 4 }} />Knowledge Transfer</span>
        </div>
        <div style={{ padding: 12 }}>
          {!jobs.length ? (
            <div className="empty" style={{ padding: '48px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <i className="hgi-stroke hgi-ai-network" style={{ fontSize: 44, opacity: 0.2 }} />
              <div style={{ fontWeight: 700, fontSize: 15 }}>No distillation jobs</div>
              <div style={{ fontSize: 13, opacity: 0.55 }}>
                Compress a large teacher model into a lightweight student via soft-label knowledge transfer
              </div>
            </div>
          ) : jobs.map(j => (
            <div className="card card-sm mb-2" key={j.id}>
              <div className="card-header">
                <span className="card-title mono">{j.studentArch}</span>
                <span className={`badge ${j.status === 'running' ? 'badge-blue' : j.status === 'done' ? 'badge-green' : 'badge-red'}`}>{j.status}</span>
              </div>
              <div className="card-body" style={{ padding: '10px 14px' }}>
                <div className="flex gap-4 text-sm mb-2">
                  <div><span className="form-label">Teacher</span><div className="mono">{j.teacherId.slice(0, 12)}…</div></div>
                  <div><span className="form-label">Temp</span><div>{j.temperature}×</div></div>
                  <div><span className="form-label">Epochs</span><div>{j.epochs}</div></div>
                </div>
                <div style={{ width: '100%', height: 6, background: 'var(--border-color)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${j.progress || (j.status === 'done' ? 100 : 30)}%`, height: '100%', background: 'var(--primary-color)', transition: 'width 0.4s ease' }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">New distillation</span></div>
        <div className="card-body">
          <div className="form-group">
            <label className="form-label">Teacher model ID</label>
            <input className="form-input" value={teacherId} onChange={e => setTeacherId(e.target.value)} placeholder="model-uuid or registry ID" />
          </div>
          <div className="form-group">
            <label className="form-label">Student architecture</label>
            <select className="form-input" value={studentArch} onChange={e => setStudentArch(e.target.value)}>
              <option value="mobilenet-v3">MobileNet-V3</option>
              <option value="efficientnet-lite">EfficientNet-Lite</option>
              <option value="squeezenet">SqueezeNet</option>
              <option value="nano-bert">NanoBERT</option>
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="form-group">
              <label className="form-label">Temperature (τ)</label>
              <input className="form-input" type="number" min={1} max={20} value={temperature} onChange={e => setTemperature(+e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Epochs</label>
              <input className="form-input" type="number" min={1} max={100} value={epochs} onChange={e => setEpochs(+e.target.value)} />
            </div>
          </div>
          <div style={{ marginBottom: 16, padding: '10px 12px', background: 'rgba(99,102,241,0.07)', borderRadius: 6, fontSize: 12 }}>
            <i className="hgi-stroke hgi-information-circle" style={{ marginRight: 6 }} />
            Student weights are anchored on-chain via Shelby after each completed job. SHA-256 provenance is automatically registered.
          </div>
          <button className="btn btn-primary" onClick={start} disabled={running} style={{ width: '100%' }}>
            {running ? 'Launching...' : 'Start Distillation'}
          </button>
        </div>
      </div>
    </div>
  );
}
