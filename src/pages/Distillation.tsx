import React, { useState, useEffect } from 'react';
import { get, post } from '../lib/api';
import { useToast } from '../contexts/AppContext';

const SAMPLE_TEMPLATE = JSON.stringify([
  { input: { text: 'sample prompt 1' }, softLabels: [0.7, 0.2, 0.1] },
  { input: { text: 'sample prompt 2' }, softLabels: [0.1, 0.8, 0.1] }
], null, 2);

export default function Distillation() {
  const toast = useToast();
  const [models, setModels] = useState<any[]>([]);
  const [studentId, setStudentId] = useState('');
  const [teacherModelId, setTeacherModelId] = useState('');
  const [temperature, setTemperature] = useState(4);
  const [pricePerSample, setPricePerSample] = useState('0.001');
  const [samplesText, setSamplesText] = useState(SAMPLE_TEMPLATE);
  const [running, setRunning] = useState(false);
  const [jobs, setJobs] = useState<any[]>([]);

  const fetchJobs = async () => {
    try {
      const res = await get<{ jobs: any[] }>('/api/distillation');
      if (res.jobs) {
        setJobs(res.jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      }
    } catch (e) {}
  };

  useEffect(() => {
    get<any>('/api/models').then(res => {
      setModels(res.models || []);
      if (res.models?.[0]) setTeacherModelId(res.models[0].id);
    }).catch(() => {});
    fetchJobs();
  }, []);

  const start = async () => {
    if (!studentId.trim()) { toast('Student ID required', 'error'); return; }
    if (!teacherModelId) { toast('Teacher model required', 'error'); return; }
    let inputSamples;
    try {
      inputSamples = JSON.parse(samplesText);
    } catch {
      toast('Samples must be valid JSON', 'error');
      return;
    }
    if (!Array.isArray(inputSamples) || !inputSamples.length) { toast('Provide at least one sample', 'error'); return; }
    if (inputSamples.some((s: any) => !Array.isArray(s.softLabels) || !s.softLabels.length)) {
      toast('Each sample needs a softLabels array (teacher probability distribution)', 'error');
      return;
    }
    setRunning(true);
    try {
      const res = await post<any>('/api/distillation', {
        studentId: studentId.trim(),
        teacherModelId,
        inputSamples,
        temperature,
        pricePerSample: Number(pricePerSample) || 0.001,
      });
      toast(`Distillation job ${res.job.id.slice(0, 10)}… started — labels bound to teacher SHA ${res.job.teacherSha256.slice(0, 10)}…`, 'success');
      fetchJobs();
    } catch (e: any) {
      toast(e.message, 'error');
    }
    setRunning(false);
  };

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Shelby Distillation Engine</h1>
          <p className="page-subtitle">Real teacher soft labels — stored on Shelby, bound to the teacher's on-chain SHA-256</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
        <div className="card">
          <div className="card-header"><span className="card-title">New Distillation</span></div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Student ID</label>
                <input className="form-input" value={studentId} onChange={e => setStudentId(e.target.value)} placeholder="usr-1" />
              </div>
              <div className="form-group">
                <label className="form-label">Teacher Model (must have on-chain SHA-256)</label>
                <select className="form-input" value={teacherModelId} onChange={e => setTeacherModelId(e.target.value)}>
                  <option value="">Select a registered model...</option>
                  {models.map(m => <option key={m.id} value={m.id}>{m.model}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Temperature (τ)</label>
                <input className="form-input" type="number" min={1} max={20} value={temperature} onChange={e => setTemperature(+e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Price per Sample (SBY)</label>
                <input className="form-input" type="number" min={0} step="0.0001" value={pricePerSample} onChange={e => setPricePerSample(e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Input Samples (JSON — each needs a softLabels distribution from the teacher)</label>
              <textarea className="form-input mono" style={{ height: 180, fontFamily: 'var(--font-mono)', fontSize: 12 }} value={samplesText} onChange={e => setSamplesText(e.target.value)} />
            </div>
            <div style={{ marginBottom: 16, padding: '10px 12px', background: 'var(--shelby-wash)', border: '1px solid var(--shelby-light)', borderRadius: 6, fontSize: 12 }}>
              <i className="hgi-stroke hgi-shield-02" style={{ marginRight: 6, color: 'var(--shelby)' }} />
              Soft labels are normalized, bound to the teacher's SHA-256 via a binding hash, and stored on Shelby — the teacher's weights are never exposed.
            </div>
            <button className="btn btn-primary" onClick={start} disabled={running} style={{ width: '100%' }}>
              {running ? 'Uploading samples + labels to Shelby...' : 'Initialize Distillation'}
            </button>
          </div>
        </div>

        <div className="card" style={{ flex: 1 }}>
          <div className="card-header"><span className="card-title">Jobs</span><button className="btn btn-sm" onClick={fetchJobs}>↻</button></div>
          <div className="card-body" style={{ padding: 12 }}>
            {!jobs.length ? (
              <div className="empty" style={{ padding: '24px 0', opacity: 0.5, textAlign: 'center' }}>No distillation jobs yet.</div>
            ) : jobs.map(j => (
              <div className="card card-sm mb-2" key={j.id}>
                <div className="card-header" style={{ padding: '8px 12px' }}>
                  <span className="card-title mono" style={{ fontSize: 11 }}>{j.id.slice(0, 12)}…</span>
                  <span className="badge badge-blue">{j.status}</span>
                </div>
                <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)' }}>
                  <div>{j.sampleCount} samples · {j.totalPrice} SBY · teacher {j.teacherSha256?.slice(0, 10)}…</div>
                  {j.bindingHash && (
                    <div style={{ marginTop: 6, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--shelby)', background: 'var(--shelby-wash)', padding: 6, borderRadius: 4 }}>
                      binding: {j.bindingHash}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
