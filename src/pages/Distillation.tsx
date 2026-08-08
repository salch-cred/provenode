import React, { useState, useEffect } from 'react';
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

  // Simulate progress for running jobs
  useEffect(() => {
    const interval = setInterval(() => {
      setJobs(prev => prev.map(j => {
        if (j.status === 'running') {
          const np = j.progress + Math.random() * 5;
          if (np >= 100) return { ...j, progress: 100, status: 'verifying' };
          return { ...j, progress: np };
        }
        if (j.status === 'verifying') {
          if (Math.random() > 0.8) {
            return { ...j, status: 'done', zkHash: '0x' + Math.random().toString(16).substring(2, 14) + '...' };
          }
        }
        return j;
      }));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const start = async () => {
    if (!teacherId) { toast('Teacher model ID required', 'error'); return; }
    setRunning(true);
    try {
      const res = await post<any>('/api/distillation', { teacherId, studentArch, temperature, epochs });
      setJobs(prev => [{ id: res.jobId || Math.random().toString(36).slice(2,8), teacherId, studentArch, temperature, epochs, status: 'running', progress: 0, createdAt: new Date().toISOString() }, ...prev]);
      toast('ZK-Distillation job started on Shelby network', 'success');
      setTeacherId('');
    } catch (e: any) {
      toast(e.message, 'error');
    }
    setRunning(false);
  };

  const activeJob = jobs.find(j => j.status === 'running' || j.status === 'verifying');

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Shelby ZK-Distillation Engine</h1>
          <p className="page-subtitle">Compress terabytes of raw Shelby data into Zero-Knowledge verified student models</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
        
        {/* Main Visualization Panel */}
        <div className="card" style={{ height: 600, overflow: 'hidden', background: '#0a0a0a', position: 'relative', display: 'flex', flexDirection: 'column' }}>
           <div className="card-header" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', zIndex: 10 }}>
              <span className="card-title">Zero-Knowledge Circuit Visualizer</span>
           </div>
           
           <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
             {/* Circuit Background */}
             <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
             
             {!activeJob ? (
                <div style={{ opacity: 0.3, textAlign: 'center' }}>
                  <i className="hgi-stroke hgi-cpu" style={{ fontSize: 48, marginBottom: 12, display: 'block' }}></i>
                  Circuit Idle. Awaiting Distillation Job.
                </div>
             ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 40, zIndex: 5 }}>
                  
                  {/* Left: Raw Shelby Data */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 80, height: 100, border: '2px solid #3b82f6', borderRadius: 8, background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(59,130,246,0.2)' }}>
                      <i className="hgi-stroke hgi-database-02" style={{ fontSize: 32, color: '#3b82f6' }}></i>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 'bold', color: '#3b82f6' }}>Teacher Model<br/>(Shelby Blobs)</span>
                  </div>

                  {/* Middle: Prover Circuit */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, position: 'relative' }}>
                    
                    {/* Animated flow lines */}
                    <svg style={{ position: 'absolute', left: -50, top: '40%', width: 50, height: 20, zIndex: 0 }}>
                       <line x1="0" y1="10" x2="50" y2="10" stroke="#3b82f6" strokeWidth="2" strokeDasharray="5" className="flow-line" />
                    </svg>
                    <svg style={{ position: 'absolute', right: -50, top: '40%', width: 50, height: 20, zIndex: 0 }}>
                       <line x1="0" y1="10" x2="50" y2="10" stroke="#ec4899" strokeWidth="2" strokeDasharray="5" className="flow-line" />
                    </svg>

                    <div style={{ width: 120, height: 120, borderRadius: '50%', border: '4px solid #8b5cf6', background: 'rgba(139,92,246,0.1)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 30px rgba(139,92,246,0.4)', position: 'relative', overflow: 'hidden' }}>
                      <i className="hgi-stroke hgi-ai-brain-01" style={{ fontSize: 40, color: '#8b5cf6', zIndex: 2 }}></i>
                      {/* Scanning effect */}
                      <div className="scanner" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: '#fff', opacity: 0.5, boxShadow: '0 0 10px #fff' }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 'bold', color: '#8b5cf6' }}>ZK-SNARK Prover<br/>({activeJob.progress.toFixed(0)}%)</span>
                  </div>

                  {/* Right: ZK Proof Output */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 80, height: 100, border: '2px solid #ec4899', borderRadius: 8, background: 'rgba(236,72,153,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(236,72,153,0.2)' }}>
                      <i className="hgi-stroke hgi-shield-check" style={{ fontSize: 32, color: '#ec4899', opacity: activeJob.status === 'verifying' ? 1 : 0.4 }}></i>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 'bold', color: '#ec4899', textAlign: 'center' }}>
                      Student Model<br/>
                      {activeJob.status === 'verifying' ? 'Generating Proof...' : activeJob.status === 'running' ? 'Awaiting Data...' : activeJob.zkHash}
                    </span>
                  </div>

                </div>
             )}
             
             <style>{`
               .flow-line { animation: dashFlow 1s linear infinite; }
               @keyframes dashFlow { from { stroke-dashoffset: 10; } to { stroke-dashoffset: 0; } }
               .scanner { animation: scan 2s linear infinite alternate; }
               @keyframes scan { from { top: 0; } to { top: 100%; } }
             `}</style>
           </div>
        </div>

        {/* Controls Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <div className="card-header"><span className="card-title">New Distillation</span></div>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label">Teacher Model (Shelby Object ID)</label>
                <input className="form-input" value={teacherId} onChange={e => setTeacherId(e.target.value)} placeholder="0x..." />
              </div>
              <div className="form-group">
                <label className="form-label">Student Architecture</label>
                <select className="form-input" value={studentArch} onChange={e => setStudentArch(e.target.value)}>
                  <option value="mobilenet-v3">MobileNet-V3 (Vision)</option>
                  <option value="efficientnet-lite">EfficientNet-Lite</option>
                  <option value="nano-bert">NanoBERT (NLP)</option>
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
              <div style={{ marginBottom: 16, padding: '10px 12px', background: 'rgba(236,72,153,0.1)', border: '1px solid rgba(236,72,153,0.2)', borderRadius: 6, fontSize: 12 }}>
                <i className="hgi-stroke hgi-shield-02" style={{ marginRight: 6, color: '#ec4899' }} />
                Output will include a cryptographic ZK-SNARK receipt verifying training lineage on the Aptos L1.
              </div>
              <button className="btn btn-primary" onClick={start} disabled={running || !!activeJob} style={{ width: '100%' }}>
                {running ? 'Launching...' : 'Initialize Distillation'}
              </button>
            </div>
          </div>

          <div className="card" style={{ flex: 1 }}>
            <div className="card-header"><span className="card-title">Recent Proofs</span></div>
            <div className="card-body" style={{ padding: 12 }}>
              {!jobs.length ? (
                <div className="empty" style={{ padding: '20px 0', opacity: 0.5, textAlign: 'center' }}>No recent distillation jobs.</div>
              ) : jobs.map(j => (
                <div className="card card-sm mb-2" key={j.id}>
                  <div className="card-header" style={{ padding: '8px 12px' }}>
                    <span className="card-title mono" style={{ fontSize: 11 }}>{j.studentArch}</span>
                    <span className={`badge ${j.status === 'running' ? 'badge-blue' : j.status === 'verifying' ? 'badge-orange' : 'badge-green'}`}>{j.status}</span>
                  </div>
                  {j.status === 'done' && (
                    <div style={{ padding: '8px 12px', fontSize: 10, fontFamily: 'monospace', color: '#ec4899', background: 'rgba(236,72,153,0.05)' }}>
                      Proof: {j.zkHash}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
