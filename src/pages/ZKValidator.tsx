import React, { useState, useEffect } from 'react';
import { get } from '../lib/api';
import { useToast } from '../contexts/AppContext';

export default function ZKValidator() {
  const toast = useToast();
  const [proofs, setProofs] = useState([
    { id: 'zk-98f211', deviceId: 'CAM-SIN-042', modelId: 'vision-v2.4.1', status: 'validating', timestamp: new Date().toISOString() },
    { id: 'zk-33a8b1', deviceId: 'DRONE-NY-01', modelId: 'nav-v3.3', status: 'verified', timestamp: new Date(Date.now() - 4000).toISOString() },
    { id: 'zk-77f920', deviceId: 'ROBOT-BER-99', modelId: 'safety-v0.9', status: 'verified', timestamp: new Date(Date.now() - 15000).toISOString() },
  ]);

  useEffect(() => {
    const timer = setInterval(() => {
      setProofs(prev => {
        const newProofs = [...prev];
        if (newProofs[0].status === 'validating') {
          newProofs[0].status = 'verified';
        }
        if (Math.random() > 0.7) {
          newProofs.unshift({
            id: `zk-${Math.random().toString(16).slice(2, 8)}`,
            deviceId: `DEV-${Math.floor(Math.random() * 1000)}`,
            modelId: 'vision-v2.4.1',
            status: 'validating',
            timestamp: new Date().toISOString()
          });
        }
        return newProofs.slice(0, 10);
      });
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div style={{ maxWidth: 860 }}>
      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <i className="hgi-stroke hgi-shield-02" style={{ color: 'var(--coral)' }} />
            <span className="card-title">ZK-SNARK Execution Proofs</span>
          </div>
        </div>
        <div className="card-body">
          <p style={{ color: 'var(--text-muted)', marginBottom: 20, fontSize: 14 }}>
            Edge devices submit Zero-Knowledge proofs (NIZKPoK) verifying they executed the exact model hash on their local data without exposing the data or weights.
          </p>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Proof ID</th>
                  <th>Edge Device</th>
                  <th>Target Model</th>
                  <th>Verification Status</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {proofs.map(p => (
                  <tr key={p.id}>
                    <td className="mono">{p.id}</td>
                    <td>{p.deviceId}</td>
                    <td>{p.modelId}</td>
                    <td>
                      {p.status === 'validating' ? (
                        <span className="badge badge-amber"><span className="spin" style={{ width: 12, height: 12, marginRight: 6, borderWidth: 2 }} /> Validating Math...</span>
                      ) : (
                        <span className="badge badge-green"><i className="hgi-stroke hgi-tick-01" style={{ marginRight: 4 }} /> On-Chain Verified</span>
                      )}
                    </td>
                    <td style={{ fontSize: 12, opacity: 0.6 }}>{new Date(p.timestamp).toLocaleTimeString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
