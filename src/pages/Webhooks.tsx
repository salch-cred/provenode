import React, { useEffect, useState } from 'react';
import { get, post, del } from '../lib/api';
import { useToast } from '../contexts/AppContext';

export default function Webhooks() {
  const toast = useToast();
  const [hooks, setHooks] = useState<any[]>([]);
  const [url, setUrl] = useState(''); const [events, setEvents] = useState('*'); const [secret, setSecret] = useState(''); const [name, setName] = useState('');

  const load = async () => { const d = await get<any>('/api/webhooks').catch(()=>({webhooks:[]})); setHooks(d.webhooks||[]); };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!url) { toast('URL required.','error'); return; }
    try { await post('/api/webhooks', { url, events: events.split(',').map(e=>e.trim()), secret: secret||undefined, name: name||undefined }); toast('Webhook registered!','success'); load(); }
    catch(e:any){ toast(e.message,'error'); }
  };
  const remove = async (id:string) => { await del(`/api/webhooks?id=${id}`).catch(()=>{}); toast('Deleted','info'); load(); };
  const test = async () => { await post('/api/webhooks', { action:'test' }).catch(()=>{}); toast('Test event dispatched!','success'); };

  return (
    <div style={{display:'grid',gridTemplateColumns:'1fr 360px',gap:20}}>
      <div className="card"><div className="card-header"><span className="card-title">Registered webhooks</span>
        <div className="flex gap-2"><button className="btn btn-sm" onClick={test}>Send test</button><button className="btn btn-sm" aria-label="Refresh" title="Refresh" onClick={load}><i className="hgi-stroke hgi-refresh" /></button></div></div>
        <div style={{padding:12}}>
          {!hooks.length ? (
            <div className="empty" style={{padding:'40px 20px', display:'flex', flexDirection:'column', alignItems:'center', gap:12}}>
              <i className="hgi-stroke hgi-plug-01" style={{fontSize:40, opacity:0.2}} />
              <div style={{fontWeight:700, fontSize:15}}>No webhooks registered</div>
              <div style={{fontSize:13, opacity:0.55}}>Subscribe to platform events like deployment.verified or integrity.mismatch via HTTP callbacks</div>
            </div>
          ) : hooks.map(h => (
            <div className="card card-sm mb-2" key={h.id}><div className="card-header"><span className="card-title">{h.name||h.url}</span><span className={`badge ${h.enabled?'badge-green':'badge-demo'}`}>{h.enabled?'enabled':'disabled'}</span></div>
            <div className="card-body" style={{padding:'10px 14px'}}><div className="mono text-sm mb-2">{h.url}</div>
              <div className="flex gap-2 mb-2">{(h.events||[]).map((e:string)=><span key={e} className="tag">{e}</span>)}</div>
              <button className="btn btn-sm btn-danger" onClick={()=>remove(h.id)}>Delete</button></div></div>
          ))}
        </div></div>
      <div className="card"><div className="card-header"><span className="card-title">Add webhook</span></div>
        <div className="card-body">
          <div className="form-group"><label className="form-label">Name</label><input className="form-input" value={name} onChange={e=>setName(e.target.value)} placeholder="Slack alerts" /></div>
          <div className="form-group"><label className="form-label">URL</label><input className="form-input" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://hooks.slack.com/…" /></div>
          <div className="form-group"><label className="form-label">Events</label><input className="form-input" value={events} onChange={e=>setEvents(e.target.value)} placeholder="* or deployment.verified" /></div>
          <div className="form-group"><label className="form-label">Secret</label><input className="form-input" value={secret} onChange={e=>setSecret(e.target.value)} placeholder="Optional HMAC secret" /></div>
          <button className="btn btn-primary" onClick={create}>Register webhook</button>
        </div></div>
    </div>
  );
}