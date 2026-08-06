import React, { useState, useEffect } from 'react';
import { post } from '../lib/api';
import { useToast } from '../contexts/AppContext';

export default function Federated() {
  const toast = useToast();
  const [nodes, setNodes] = useState<any[]>([]);
  const [globalEpoch, setGlobalEpoch] = useState(1);
  const [merging, setMerging] = useState(false);

  // Mock nodes
  useEffect(() => {
    setNodes([
      { id: 'node_eu_1', location: 'Frankfurt', status: 'training', loss: 0.45, weightsHash: '' },
      { id: 'node_us_east', location: 'N. Virginia', status: 'waiting', loss: 0.42, weightsHash: '0x8f...3a2' },
      { id: 'node_ap_1', location: 'Singapore', status: 'pushing', loss: 0.46, weightsHash: '' },
    ]);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setNodes(prev => prev.map(n => {
        if (n.status === 'training' && Math.random() > 0.8) return { ...n, status: 'pushing' };
        if (n.status === 'pushing' && Math.random() > 0.6) return { ...n, status: 'waiting', weightsHash: `0x${Math.random().toString(16).substring(2, 10)}...` };
        if (n.status === 'training') return { ...n, loss: Math.max(0.1, n.loss - 0.01) };
        return n;
      }));
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  const triggerMerge = async () => {
    const readyNodes = nodes.filter(n => n.status === 'waiting');
    if (readyNodes.length < 2) return toast('Need at least 2 nodes waiting with weights', 'error');
    
    setMerging(true);
    try {
      await post('/api/federated/merge', { nodeIds: readyNodes.map(n => n.id) });
      toast('Global model updated via Erasure Coding merge', 'success');
      setGlobalEpoch(e => e + 1);
      setNodes(prev => prev.map(n => ({ ...n, status: 'training', weightsHash: '' })));
    } catch (e: any) {
      toast(e.message, 'error');
    }
    setMerging(false);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Federated Learning Coordinator</h2>
          <p className="text-muted text-sm" style={{ margin: '4px 0 0 0' }}>Decentralized privacy-preserving training using Shelby Clay Codes</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><span className="card-title">Global Model Status</span><span className="badge badge-shelby">Epoch {globalEpoch}</span></div>
        <div className="card-body">
          <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div className="text-sm text-muted">Aptos Anchor</div>
              <div className="mono text-sm">0xabc...def123</div>
            </div>
            <button className="btn btn-primary" onClick={triggerMerge} disabled={merging || nodes.filter(n => n.status === 'waiting').length < 2}>
              {merging ? 'Merging Weights via Erasure Coding...' : 'Trigger Global Merge'}
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Edge Node ID</th>
                <th>Location</th>
                <th>Local Loss</th>
                <th>Weights Hash (Shelby)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map(n => (
                <tr key={n.id}>
                  <td className="mono">{n.id}</td>
                  <td>{n.location}</td>
                  <td>{n.loss.toFixed(4)}</td>
                  <td className="mono text-sm">{n.weightsHash || '—'}</td>
                  <td>
                    {n.status === 'training' && <span className="badge badge-yellow">Training</span>}
                    {n.status === 'pushing' && <span className="badge badge-blue">Pushing to Shelby</span>}
                    {n.status === 'waiting' && <span className="badge badge-green">Ready to Merge</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
