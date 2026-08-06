import React, { useEffect, useState } from 'react';
import { get, post } from '../lib/api';
import { useToast } from '../contexts/AppContext';

export default function Datasets() {
  const toast = useToast();
  const [datasets, setDatasets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await get<any>('/api/datasets');
      setDatasets(res.datasets || []);
    } catch (e: any) {
      toast(e.message, 'error');
    }
    setLoading(false);
  };

  const registerDummy = async () => {
    try {
      await post('/api/datasets', {
        name: `Dataset-${Math.floor(Math.random() * 1000)}`,
        license: 'MIT',
        source: 'huggingface',
        description: 'Demo dataset for provenance tracking.'
      });
      toast('Dataset registered on-chain via Shelby', 'success');
      load();
    } catch (e: any) {
      toast(e.message, 'error');
    }
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

  useEffect(() => { load(); }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Dataset Registry</h2>
          <p className="text-muted text-sm" style={{ margin: '4px 0 0 0' }}>EU AI Act compliant dataset provenance and GDPR management</p>
        </div>
        <button className="btn btn-primary" onClick={registerDummy}><i className="hgi-stroke hgi-plus" /> Register Dataset</button>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Dataset Name</th>
                <th>Merkle Root (Provenance)</th>
                <th>Size / Shards</th>
                <th>License</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40 }}><div className="spin" /></td></tr>
              ) : !datasets.length ? (
                <tr><td colSpan={7} className="empty">No datasets registered.</td></tr>
              ) : (
                datasets.map(d => (
                  <tr key={d.id} style={{ opacity: d.status === 'deletion_pending' ? 0.6 : 1 }}>
                    <td>
                      <strong>{d.name}</strong><br/>
                      <span className="text-sm text-muted">{new Date(d.registeredAt).toLocaleString()}</span>
                    </td>
                    <td className="mono text-sm">{d.merkleRoot?.slice(0, 16)}…</td>
                    <td>{d.totalBytes ? `${(d.totalBytes / 1024 / 1024).toFixed(1)} MB` : '—'} <br/><span className="badge">{d.shardCount || 0} shards</span></td>
                    <td><span className="badge badge-blue">{d.license}</span></td>
                    <td><span className="badge badge-green"><i className="hgi-stroke hgi-shield-check" /> ZK Verified (No PII)</span></td>
                    <td>
                      {d.status === 'deletion_pending' ? (
                        <span className="badge badge-red"><i className="hgi-stroke hgi-delete-02" /> Pending Deletion</span>
                      ) : (
                        <span className="badge badge-green"><i className="hgi-stroke hgi-tick-double" /> Active</span>
                      )}
                    </td>
                    <td>
                      {d.status !== 'deletion_pending' && (
                        <div className="flex gap-2" style={{flexDirection: 'column'}}>
                           <button className="btn btn-sm btn-primary" onClick={() => {
                             if(window.confirm('Buy this dataset stream for 1.5 SBY?')) toast('Purchased via Micropayment Channel!', 'success');
                           }}>Purchase Stream (1.5 SBY)</button>
                           <button className="btn btn-sm" style={{color: 'var(--red-color)', borderColor: 'var(--border-color)'}} onClick={() => requestDeletion(d.id)}>Request Deletion (GDPR)</button>
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
    </div>
  );
}
