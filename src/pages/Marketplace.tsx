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

  // Import payment flow
  const [importingId, setImportingId] = useState<string | null>(null);
  const [intent, setIntent] = useState<any>(null);
  const [bcs, setBcs] = useState('');
  const [settling, setSettling] = useState(false);

  const load = async () => {
    const [l, m] = await Promise.all([get<any>('/api/marketplace').catch(() => ({ listings: [] })), get<any>('/api/models').catch(() => ({ models: [] }))]);
    setListings(l.listings || []); setModels(m.models || []);
  };
  useEffect(() => { load(); }, []);

  const startImport = async (id: string, name: string) => {
    setImportingId(id); setIntent(null); setBcs('');
    try {
      const res = await post<any>('/api/payments', { item: 'marketplace_import', itemId: id, description: `Marketplace import: ${name}` });
      setIntent(res.intent);
    } catch (e: any) {
      toast(e.message, 'error');
      setImportingId(null);
    }
  };

  const settleAndImport = async () => {
    if (!intent) return;
    const bcsTrim = bcs.trim();
    if (!bcsTrim) return toast('Paste the buyer micropayment BCS from your wallet', 'error');
    setSettling(true);
    try {
      await post<any>('/api/payments', { action: 'verify', intentId: intent.id, micropaymentBcs: bcsTrim });
      const imported = await post<any>('/api/marketplace', { action: 'import', listingId: intent.itemId, paymentIntentId: intent.id });
      toast(`Imported ${imported.record?.model || 'model'} — ${imported.modelId?.slice(0, 10)}…`, 'success');
      setImportingId(null);
      load();
    } catch (e: any) {
      toast(e.message, 'error');
    }
    setSettling(false);
  };

  const publish = async () => {
    if (!modelId) { toast('Select a model first', 'error'); return; }
    try {
      await post('/api/marketplace', { modelId, description: desc, tags: tags.split(',').map(t => t.trim()).filter(Boolean), price: Number(price) || 0 });
      toast('Published to Marketplace!', 'success');
      setDesc(''); setTags(''); setPrice('0');
      load();
    } catch (e: any) { toast(e.message, 'error'); }
  };

  return (
    <div className="responsive-grid">
      <div className="card">
        <div className="card-header"><span className="card-title">Community Model Marketplace</span><button className="btn btn-sm" onClick={load}>↻</button></div>
        <div style={{ padding: 12 }}>
          {!listings.length ? (
            <div className="empty" style={{ padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <i className="hgi-stroke hgi-store-01" style={{ fontSize: 40, opacity: 0.2 }} />
              <div style={{ fontWeight: 700, fontSize: 15 }}>No models listed</div>
              <div style={{ fontSize: 13, opacity: 0.55 }}>Publish a model from your registry to make it available for others to license</div>
            </div>
          ) : listings.map(l => (
            <div className="card card-sm mb-2" key={l.id}>
              <div className="card-header"><span className="card-title">{l.name}</span><span className="badge badge-demo">{l.license || 'MIT'}</span></div>
              <div className="card-body" style={{ padding: 12 }}>
                <div className="text-muted text-sm mb-2">{l.description || 'No description'}</div>
                <div className="flex gap-2 items-center text-sm mb-3">
                  <span>{fmt(l.size)}</span>
                  <span className="badge badge-shelby">shelby</span>
                  <span className="badge badge-yellow">{l.price > 0 ? `${l.price} SBY / import` : 'Free + platform fee'}</span>
                  <span className="ml-auto text-muted">⬇ {l.downloads || 0}</span>
                </div>
                <div className="flex gap-2">
                  <button className="btn btn-sm btn-primary" onClick={() => startImport(l.id, l.name)} disabled={importingId === l.id}>
                    {importingId === l.id ? 'Opening channel...' : 'Pay with SBY (Aptos)'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Publish your model</span></div>
        <div className="card-body">
          <div className="form-group"><label className="form-label">Model</label><select className="form-input" value={modelId} onChange={e => setModelId(e.target.value)}><option value="">—</option>{models.map(m => <option key={m.id} value={m.id}>{m.model}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Price per Import (SBY)</label><input className="form-input" type="number" step="0.01" min="0" value={price} onChange={e => setPrice(e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Description</label><textarea className="form-input" style={{ height: 72 }} value={desc} onChange={e => setDesc(e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Tags</label><input className="form-input" value={tags} onChange={e => setTags(e.target.value)} placeholder="onnx, arm64" /></div>
          <button className="btn btn-primary" onClick={publish}>Publish →</button>
        </div>
      </div>

      {intent && (
        <div className="card" style={{ gridColumn: '1 / -1', border: '1px solid rgba(20, 241, 149, 0.3)' }}>
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
              Open a Shelby micropayment channel to the receiver above for <strong>{intent.amountShelbyUSD} ShelbyUSD</strong>, build a <span className="mono">SenderBuiltMicropayment</span>, and paste its BCS bytes below to settle on-chain before importing.
            </div>
            <div className="form-group">
              <label className="form-label">Micropayment BCS (from your wallet)</label>
              <textarea className="form-input mono" style={{ height: 60, fontFamily: 'var(--font-mono)', fontSize: 12 }} value={bcs} onChange={e => setBcs(e.target.value)} placeholder="hex or base64 BCS…" />
            </div>
            <div className="flex gap-2">
              <button className="btn btn-primary" onClick={settleAndImport} disabled={settling}>
                {settling ? 'Settling on-chain...' : 'Settle Payment & Import'}
              </button>
              <button className="btn" onClick={() => { setImportingId(null); setIntent(null); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
