import React, { useEffect, useState } from 'react';
import { get, post, del } from '../lib/api';
import { useToast } from '../contexts/AppContext';

export default function ABTest() {
  const toast = useToast();
  const [models, setModels] = useState<any[]>([]);
  const [tests, setTests] = useState<any[]>([]);
  const [name, setName] = useState(''); const [a, setA] = useState(''); const [b, setB] = useState('');
  const [split, setSplit] = useState(50); const [hours, setHours] = useState(24);

  const load = async () => {
    const [m, t] = await Promise.all([get<any>('/api/models').catch(()=>({models:[]})), get<any>('/api/abtest').catch(()=>({tests:[]}))]);
    setModels(m.models||[]); setTests(t.tests||[]);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!name||!a||!b) { toast('Name and both models required.','error'); return; }
    if (a===b) { toast('Models must be different.','error'); return; }
    try { await post('/api/abtest', { name, modelAId:a, modelBId:b, splitPercent:split, durationHours:hours }); toast('A/B test created!','success'); load(); }
    catch(e:any){ toast(e.message,'error'); }
  };
  const end = async (id:string) => { await del(`/api/abtest?id=${id}`).catch(()=>{}); toast('Test ended.','info'); load(); };

  return (
    <div style={{display:'grid',gridTemplateColumns:'1fr 340px',gap:20}}>
      <div className="card"><div className="card-header"><span className="card-title">Active A/B tests</span><button className="btn btn-sm" onClick={load}>↻</button></div>
        <div style={{padding:12}}>
          {!tests.length ? <div className="empty">No A/B tests yet.</div> : tests.map(t => (
            <div className="card card-sm" style={{marginBottom:12}} key={t.id}>
              <div className="card-header"><span className="card-title">{t.name}</span><span className={`badge ${t.status==='running'?'badge-green':'badge-demo'}`}>{t.status}</span></div>
              <div className="card-body" style={{padding:12}}>
                <div className="flex gap-4 text-sm"><div><span className="form-label">Split</span>{t.splitPercent}/{100-t.splitPercent}</div><div><span className="form-label">Ends</span>{new Date(t.endsAt).toLocaleDateString()}</div></div>
                {t.status==='running' && <button className="btn btn-sm btn-danger" style={{marginTop:8}} onClick={()=>end(t.id)}>End test</button>}
              </div>
            </div>
          ))}
        </div></div>
      <div className="card"><div className="card-header"><span className="card-title">New A/B test</span></div>
        <div className="card-body">
          <div className="form-group"><label className="form-label">Test name</label><input value={name} onChange={e=>setName(e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Model A</label><select value={a} onChange={e=>setA(e.target.value)}><option value="">—</option>{models.map(m=><option key={m.id} value={m.id}>{m.model}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Model B</label><select value={b} onChange={e=>setB(e.target.value)}><option value="">—</option>{models.map(m=><option key={m.id} value={m.id}>{m.model}</option>)}</select></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <div className="form-group"><label className="form-label">Split A%</label><input type="number" value={split} onChange={e=>setSplit(+e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Duration (h)</label><input type="number" value={hours} onChange={e=>setHours(+e.target.value)} /></div>
          </div>
          <button className="btn btn-primary" onClick={create}>Create Test</button>
        </div></div>
    </div>
  );
}