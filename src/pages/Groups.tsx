import React, { useEffect, useState } from 'react';
import { get, post, del } from '../lib/api';
import { useToast } from '../contexts/AppContext';

export default function Groups() {
  const toast = useToast();
  const [groups, setGroups] = useState<any[]>([]);
  const [name, setName] = useState(''); const [desc, setDesc] = useState(''); const [tags, setTags] = useState(''); const [color, setColor] = useState('#6366f1');

  const load = async () => { const d = await get<any>('/api/groups').catch(()=>({groups:[]})); setGroups(d.groups||[]); };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!name) { toast('Name required.','error'); return; }
    const tagList = tags.split(',').map(t=>t.trim()).filter(Boolean);
    try { await post('/api/groups', { name, description:desc, selector: tagList.length?{tags:tagList}:null, color }); toast('Group created!','success'); load(); }
    catch(e:any){ toast(e.message,'error'); }
  };
  const remove = async (id:string) => { await del(`/api/groups?id=${id}`).catch(()=>{}); toast('Deleted','info'); load(); };

  return (
    <div style={{display:'grid',gridTemplateColumns:'1fr 320px',gap:20}}>
      <div className="card"><div className="card-header"><span className="card-title">Fleet groups</span><button className="btn btn-sm" onClick={load}>↻</button></div>
        <div style={{padding:12}}>{!groups.length ? <div className="empty">No fleet groups yet.</div> : groups.map(g => (
          <div className="card card-sm mb-2" style={{borderLeft:`4px solid ${g.color||'var(--shelby)'}`}} key={g.id}>
            <div className="card-header"><span className="card-title">{g.name}</span></div>
            <div className="card-body" style={{padding:'10px 14px'}}>
              <div className="text-muted text-sm mb-2">{g.description||'No description'}</div>
              {g.selector?.tags && <div>{g.selector.tags.map((t:string)=><span key={t} className="tag">{t}</span>)}</div>}
              <button className="btn btn-sm btn-danger" style={{marginTop:8}} onClick={()=>remove(g.id)}>Delete</button>
            </div></div>
        ))}</div></div>
      <div className="card"><div className="card-header"><span className="card-title">Create group</span></div>
        <div className="card-body">
          <div className="form-group"><label className="form-label">Group name</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="Production Cameras" /></div>
          <div className="form-group"><label className="form-label">Description</label><input value={desc} onChange={e=>setDesc(e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Match tags</label><input value={tags} onChange={e=>setTags(e.target.value)} placeholder="production,camera" /></div>
          <div className="form-group"><label className="form-label">Color</label><input type="color" value={color} onChange={e=>setColor(e.target.value)} style={{width:60,height:36,padding:2}} /></div>
          <button className="btn btn-primary" onClick={create}>Create group</button>
        </div></div>
    </div>
  );
}