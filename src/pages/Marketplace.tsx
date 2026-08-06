import React, { useEffect, useState } from 'react';
import { get, post } from '../lib/api';
import { fmt } from '../lib/utils';
import { useToast } from '../contexts/AppContext';

export default function Marketplace() {
  const toast = useToast();
  const [listings, setListings] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [modelId, setModelId] = useState(''); const [desc, setDesc] = useState(''); const [tags, setTags] = useState('');
  const [price, setPrice] = useState('0');

  const load = async () => {
    const [l, m] = await Promise.all([get<any>('/api/marketplace').catch(()=>({listings:[]})), get<any>('/api/models').catch(()=>({models:[]}))]);
    setListings(l.listings||[]); setModels(m.models||[]);
  };
  useEffect(() => { load(); }, []);

  const importListing = async (id:string, name:string, price:number) => {
    if (price > 0 && !window.confirm(`This model costs ${price} SBY per inference. Open a micropayment channel?`)) return;
    try { await post('/api/marketplace', { action:'import', listingId:id }); toast(`Opened payment channel & imported ${name}!`,'success'); load(); }
    catch(e:any){ toast(e.message,'error'); }
  };
  const publish = async () => {
    if (!modelId) { toast('Select a model first','error'); return; }
    try { await post('/api/marketplace', { modelId, description:desc, tags: tags.split(',').map(t=>t.trim()).filter(Boolean), price: Number(price) }); toast('Published to Marketplace!','success'); load(); }
    catch(e:any){ toast(e.message,'error'); }
  };

  return (
    <div style={{display:'grid',gridTemplateColumns:'1fr 320px',gap:20}}>
      <div className="card"><div className="card-header"><span className="card-title">Community Model Marketplace</span><button className="btn btn-sm" onClick={load}>↻</button></div>
        <div style={{padding:12}}>{!listings.length ? <div className="empty">No models published yet. Be the first!</div> : listings.map(l => (
          <div className="card card-sm mb-2" key={l.id}><div className="card-header"><span className="card-title">{l.name}</span><span className="badge badge-demo">{l.license||'MIT'}</span></div>
          <div className="card-body" style={{padding:12}}>
            <div className="text-muted text-sm mb-2">{l.description||'No description'}</div>
            <div className="flex gap-2 items-center text-sm"><span>{fmt(l.size)}</span><span className={`badge ${l.mode==='shelby'?'badge-shelby':'badge-demo'}`}>{l.mode}</span><span className="badge badge-yellow">{l.price ? `${l.price} SBY / req` : 'Free'}</span><span className="ml-auto text-muted">⬇ {l.downloads||0}</span></div>
            <button className="btn btn-sm btn-primary" style={{marginTop:10}} onClick={()=>importListing(l.id,l.name,l.price)}>Import Model</button>
          </div></div>
        ))}</div></div>
      <div className="card"><div className="card-header"><span className="card-title">Publish your model</span></div>
        <div className="card-body">
          <div className="form-group"><label className="form-label">Model</label><select value={modelId} onChange={e=>setModelId(e.target.value)}><option value="">—</option>{models.map(m=><option key={m.id} value={m.id}>{m.model}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Price per Inference (SBY)</label><input type="number" step="0.01" value={price} onChange={e=>setPrice(e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Description</label><textarea style={{height:72}} value={desc} onChange={e=>setDesc(e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Tags</label><input value={tags} onChange={e=>setTags(e.target.value)} placeholder="onnx, arm64" /></div>
          <button className="btn btn-primary" onClick={publish}>Publish →</button>
        </div></div>
    </div>
  );
}