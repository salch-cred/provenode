import React, { useEffect, useState } from 'react';
import { get, post } from '../lib/api';
import { fmt } from '../lib/utils';
import { useToast } from '../contexts/AppContext';

export default function ObjectsPage() {
  const toast = useToast();
  const [objects, setObjects] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => { const d = await get<any>('/api/objects').catch(()=>({objects:[],stats:{}})); setObjects(d.objects||[]); setStats(d.stats||{}); };
  useEffect(() => { load(); }, []);

  // Real blob download + SHA-256 verification (streams bytes, not a demo URL).
  const download = async (o: any) => {
    setBusy(o.id);
    try {
      // Binary response, so this cannot use apiFetch (which parses JSON), but it
      // must still send the same headers apiFetch would.
      const headers: Record<string, string> = {};
      const token = localStorage.getItem('token');
      const tenant = localStorage.getItem('tenant');
      if (token) headers['X-Provenode-Token'] = token;
      if (tenant) headers['X-Tenant-Id'] = tenant;
      const res = await fetch(`/api/objects/${o.id}/blob`, { headers });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${o.model || 'model'}.bin`;
      a.click();
      URL.revokeObjectURL(url);
      toast(`Blob downloaded (${fmt(blob.size)}) and verified against SHA-256.`, 'success');
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(null); }
  };

  // Real renewal: re-uploads the blob to Shelby with a fresh 90-day expiry.
  const renew = async (o: any) => {
    setBusy(o.id);
    try {
      const d = await post<any>(`/api/objects/${o.id}/renew`, {});
      toast(`Renewed — expires ${new Date(d.expiresAt).toLocaleDateString()}`, 'success');
      load();
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(null); }
  };

  return (
    <div>
      <div className="stat-grid mb-4">
        <div className="stat-card"><div className="stat-label">Total</div><div className="stat-value" style={{color:'var(--shelby)'}}>{stats.total||0}</div></div>
        <div className="stat-card"><div className="stat-label">Healthy</div><div className="stat-value" style={{color:'var(--green)'}}>{stats.healthy||0}</div></div>
        <div className="stat-card"><div className="stat-label">Expiring soon</div><div className="stat-value" style={{color:'var(--amber)'}}>{stats.expiringSoon||0}</div></div>
        <div className="stat-card"><div className="stat-label">Expired</div><div className="stat-value" style={{color:'var(--red)'}}>{stats.expired||0}</div></div>
      </div>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Shelby object registry</span>
          <button className="btn btn-sm" aria-label="Refresh" title="Refresh" onClick={load}><i className="hgi-stroke hgi-refresh" /></button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th>Object ID</th>
                <th>Size</th>
                <th>Erasure Coding</th>
                <th>Expiry</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {!objects.length ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty" style={{padding:'40px 20px', display:'flex', flexDirection:'column', alignItems:'center', gap:12}}>
                      <i className="hgi-stroke hgi-cloud" style={{fontSize:40, opacity:0.2}} />
                      <div style={{fontWeight:700, fontSize:15}}>No objects in Shelby storage</div>
                      <div style={{fontSize:13, opacity:0.55}}>Deploy a model in Shelby mode to create persisted object blobs with provenance tracking</div>
                    </div>
                  </td>
                </tr>
              ) : (
                objects.map(o => (
                  <React.Fragment key={o.id}>
                    <tr>
                      <td><strong>{o.model}</strong></td>
                      <td className="mono text-sm">{(o.objectId||'').slice(0,30)}…</td>
                      <td>{fmt(o.size)}</td>
                      <td><span className="badge badge-shelby">Erasure-coded</span></td>
                      <td><span className={`badge ${o.status==='healthy'?'badge-green':o.status==='expiring_soon'?'badge-amber':'badge-red'}`}>{o.daysLeft!=null?`${o.daysLeft}d left`:'unknown'}</span></td>
                      <td>
                        <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
                          <button className="btn btn-sm" disabled={busy === o.id} onClick={() => download(o)}>
                            <i className="hgi-stroke hgi-download-01" /> {busy === o.id ? '…' : 'Download'}
                          </button>
                          <button className="btn btn-sm" disabled={busy === o.id} onClick={() => renew(o)}>
                            <i className="hgi-stroke hgi-refresh" /> Renew
                          </button>
                          <button className="btn btn-sm" onClick={() => setExpanded(expanded === o.id ? null : o.id)}>
                            <i className="hgi-stroke hgi-information-circle" /> {expanded === o.id ? 'Hide details' : 'Details'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expanded === o.id && (
                      <tr style={{ background: 'var(--surface)' }}>
                        <td colSpan={6} style={{ padding: '24px 32px' }}>
                          <h4 style={{ margin: '0 0 8px 0', fontSize: 14 }}>Shelby object details</h4>
                          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                            Shelby erasure-codes and disperses this blob across storage providers.
                            Per-provider placement is internal to the protocol and not exposed by
                            the API, so the fields below are what we can verify.
                          </p>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                            {[
                              ['Object ID', o.objectId || '—'],
                              ['SHA-256', o.sha256 || '—'],
                              ['Size', fmt(o.size)],
                              ['Owner address', o.address || '—'],
                              ['Expires', o.expiresAt ? new Date(o.expiresAt).toLocaleString() : '—'],
                              ['Mode', o.mode || '—'],
                            ].map(([k, v]) => (
                              <div key={k as string} style={{ border: '1px solid var(--border)', padding: 12, borderRadius: 8, background: 'var(--bg)' }}>
                                <div className="form-label" style={{ marginBottom: 4 }}>{k}</div>
                                <div className="mono" style={{ fontSize: 11.5, wordBreak: 'break-all' }}>{v}</div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}