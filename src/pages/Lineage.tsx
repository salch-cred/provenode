import React, { useEffect, useState } from 'react';
import { get } from '../lib/api';
import { ago } from '../lib/utils';

export default function Lineage() {
  const [models, setModels] = useState<any[]>([]);
  const [selected, setSelected] = useState('');
  const [data, setData] = useState<any>(null);

  useEffect(() => { get<any>('/api/models').then(d=>setModels(d.models||[])).catch(()=>{}); }, []);

  const view = async (id: string) => {
    setSelected(id);
    if (!id) return;
    const d = await get<any>(`/api/lineage?modelId=${id}`).catch(()=>null);
    setData(d);
  };

  const Node = ({n, cls}: {n:any; cls:string}) => (
    <div className={`lineage-node ${cls}`}>
      <div className="fw-700">{n.model}</div>
      <div className="mono text-sm">{n.sha256?.slice(0,8)}…</div>
      <div><span className={`badge ${n.mode==='shelby'?'badge-shelby':'badge-demo'}`}>{n.mode}</span></div>
      <div className="text-sm text-muted">{ago(n.createdAt)}</div>
    </div>
  );

  return (
    <div style={{maxWidth:640}}>
      <div className="card mb-4"><div className="card-header"><span className="card-title">Model lineage graph</span></div>
        <div className="card-body"><div className="flex gap-2">
          <select style={{flex:1}} value={selected} onChange={e=>view(e.target.value)}>
            <option value="">— Select model —</option>
            {models.map(m => <option key={m.id} value={m.id}>{m.model}</option>)}
          </select>
        </div></div></div>
      <div className="card"><div className="card-header"><span className="card-title">Ancestry tree</span></div>
        <div className="card-body">
          {!data ? <div className="empty">Select a model above to view its lineage.</div> : (
            <div>
              <div className="lineage-tree">
                {data.ancestors?.map((a:any) => <React.Fragment key={a.id}><Node n={a} cls="ancestor"/><div className="lineage-arrow">↓</div></React.Fragment>)}
                <Node n={data.root} cls="root" />
                {data.descendants?.map((d:any) => <React.Fragment key={d.id}><div className="lineage-arrow">↓</div><Node n={d} cls="descendant"/></React.Fragment>)}
              </div>
              <div style={{marginTop:16,fontSize:12,color:'var(--text-muted)'}}>Depth: {data.depth} · {data.ancestors?.length||0} ancestor(s) · {data.descendants?.length||0} descendant(s)</div>
            </div>
          )}
        </div></div>
    </div>
  );
}