import React, { useEffect, useState, useRef } from 'react';
import { get, post } from '../lib/api';
import { useToast } from '../contexts/AppContext';

export default function Datasets() {
  const toast = useToast();
  const [datasets, setDatasets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Registration form
  const [name, setName] = useState('');
  const [license, setLicense] = useState('MIT');
  const [source, setSource] = useState('huggingface');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [registering, setRegistering] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Payment flow
  const [payingId, setPayingId] = useState<string | null>(null);
  const [intent, setIntent] = useState<any>(null);
  const [bcs, setBcs] = useState('');
  const [settling, setSettling] = useState(false);

  const load = async () => {
    try {
      const res = await get<any>('/api/datasets');
      setDatasets(res.datasets || []);
    } catch (e: any) {
      toast(e.message, 'error');
    }
    setLoading(false);
  };

  const register = async () => {
    if (!file) return toast('Select a dataset file to register (real bytes, sharded on Shelby)', 'error');
    if (!name.trim()) return toast('Dataset name required', 'error');
    setRegistering(true);
    try {
      const reader = new FileReader();
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });
      await post('/api/datasets', { name: name.trim(), license, source, description, dataBase64 });
      toast('Dataset sharded and registered on Shelby', 'success');
      setName(''); setDescription(''); setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      load();
    } catch (e: any) {
      toast(e.message, 'error');
    }
    setRegistering(false);
  };

  const requestDeletion = async (id: string) => {
    try {
      await post('/api/datasets/delete', { datasetId: id, reason: 'GDPR Right to Forget' });
      toast('Deletion request anchored on-chain.', 'success');
      load();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const startPurchase = async (d: any) => {
    setPayingId(d.id); setIntent(null); setBcs('');
    try {
      const res = await post<any>('/api/payments', { item: 'dataset_stream', itemId: d.id, description: `Dataset stream: ${d.name}` });
      setIntent(res.intent);
    } catch (e: any) {
      toast(e.message, 'error');
      setPayingId(null);
    }
  };

  const settleAndStream = async () => {
    if (!intent) return;
    const bcsTrim = bcs.trim();
    if (!bcsTrim) return toast('Paste the buyer micropayment BCS from your wallet', 'error');
    setSettling(true);
    try {
      const paid = await post<any>('/api/payments', { action: 'verify', intentId: intent.id, micropaymentBcs: bcsTrim });
      const stream = await get<any>(`/api/datasets?id=${encodeURIComponent(intent.itemId)}&stream=1&paymentIntentId=${intent.id}`);
      toast(`Stream unlocked — ${stream.shards.length} shards, receipt ${paid.receiptHash?.slice(0, 10)}…`, 'success');
      setPayingId(null);
    } catch (e: any) {
      toast(e.message, 'error');
    }
    setSettling(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Dataset Registry</h2>
          <p className="text-muted text-sm" style={{ margin: '4px 0 0 0' }}>EU AI Act compliant dataset provenance — real shards on Shelby</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><span className="card-title">Register Dataset (real bytes)</span></div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Name</label>
              <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="imagenet-mini" />
            </div>
            <div className="form-group">
              <label className="form-label">License</label>
              <input className="form-input" value={license} onChange={e => setLicense(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Source</label>
              <input className="form-input" value={source} onChange={e => setSource(e.target.value)} placeholder="huggingface / internal / web" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-input" style={{ height: 60 }} value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Dataset file</label>
            <input ref={fileRef} type="file" className="form-input" onChange={e => setFile(e.target.files?.[0] || null)} />
            <div className="text-sm text-muted" style={{ marginTop: 6 }}>
              {file ? `${file.name} — ${(file.size / 1024).toFixed(1)} KB, will be sharded (10 MB/shard) and uploaded to Shelby` : 'No file selected'}
            </div>
          </div>
          <button className="btn btn-primary" onClick={register} disabled={registering || !file}>
            {registering ? 'Sharding + uploading to Shelby...' : 'Register Dataset'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Dataset Name</th>
                <th>Merkle Root</th>
                <th>Shards</th>
                <th>License</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40 }}><div className="spin" /></td></tr>
              ) : !datasets.length ? (
                <tr><td colSpan={6}>
                  <div className="empty" style={{ padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <i className="hgi-stroke hgi-folder-library" style={{ fontSize: 40, opacity: 0.2 }} />
                    <div style={{ fontWeight: 700, fontSize: 15 }}>No datasets registered</div>
                    <div style={{ fontSize: 13, opacity: 0.55 }}>Register real dataset bytes to anchor their Merkle provenance hash on-chain</div>
                  </div>
                </td></tr>
              ) : (
                datasets.map(d => (
                  <tr key={d.id} style={{ opacity: d.status === 'deletion_pending' ? 0.6 : 1 }}>
                    <td>
                      <strong>{d.name}</strong><br />
                      <span className="text-sm text-muted">{new Date(d.registeredAt).toLocaleString()}</span>
                    </td>
                    <td>
                      <span className="mono text-sm">{d.merkleRoot?.slice(0, 16)}…</span>
                      <div className="text-sm text-muted" style={{ marginTop: 4 }}>{d.totalBytes ? `${(d.totalBytes / 1024 / 1024).toFixed(1)} MB` : ''}</div>
                    </td>
                    <td><span className="badge badge-blue">{d.shardCount} shards</span></td>
                    <td><span className="badge badge-blue">{d.license}</span></td>
                    <td>
                      {d.status === 'deletion_pending' ? (
                        <span className="badge badge-red"><i className="hgi-stroke hgi-delete-02" /> Pending Deletion</span>
                      ) : (
                        <span className="badge badge-green"><i className="hgi-stroke hgi-tick-double" /> Active</span>
                      )}
                    </td>
                    <td>
                      {d.status !== 'deletion_pending' && (
                        <div className="flex gap-2" style={{ flexDirection: 'column' }}>
                          <button className="btn btn-sm btn-primary" onClick={() => startPurchase(d)} disabled={payingId === d.id}>
                            {payingId === d.id ? 'Opening channel...' : 'Purchase Stream (1.5 SBY)'}
                          </button>
                          <button className="btn btn-sm" style={{ color: 'var(--red-color)', borderColor: 'var(--border-color)' }} onClick={() => requestDeletion(d.id)}>Request Deletion (GDPR)</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {intent && (
        <div className="card" style={{ marginTop: 20, border: '1px solid rgba(20, 241, 149, 0.3)' }}>
          <div className="card-header"><span className="card-title">ShelbyUSD Payment — {intent.amountShelbyUSD} SBY</span><span className="badge badge-yellow">Intent {intent.id.slice(0, 10)}…</span></div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <div className="text-sm text-muted">Receiver (this deployment)</div>
                <div className="mono text-sm">{intent.receiver || '—'}</div>
              </div>
              <div>
                <div className="text-sm text-muted">Expires</div>
                <div className="text-sm">{new Date(intent.expiresAt).toLocaleString()}</div>
              </div>
            </div>
            <div className="text-sm" style={{ marginBottom: 12, lineHeight: 1.6 }}>
              Open a Shelby micropayment channel to the receiver above for <strong>{intent.amountShelbyUSD} ShelbyUSD</strong>, build a <span className="mono">SenderBuiltMicropayment</span>, and paste its BCS bytes below to settle on-chain.
            </div>
            <div className="form-group">
              <label className="form-label">Micropayment BCS (from your wallet)</label>
              <textarea className="form-input mono" style={{ height: 60, fontFamily: 'var(--font-mono)', fontSize: 12 }} value={bcs} onChange={e => setBcs(e.target.value)} placeholder="hex or base64 BCS…" />
            </div>
            <div className="flex gap-2">
              <button className="btn btn-primary" onClick={settleAndStream} disabled={settling}>
                {settling ? 'Settling on-chain + unlocking stream...' : 'Settle Payment & Unlock Stream'}
              </button>
              <button className="btn" onClick={() => { setPayingId(null); setIntent(null); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
