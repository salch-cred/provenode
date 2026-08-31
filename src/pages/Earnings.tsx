import React, { useEffect, useState } from 'react';

export default function Earnings() {
  const [data, setData] = useState<{ nodes: any[], totalEarned: string, tokenVelocity: string } | null>(null);

  useEffect(() => {
    const fetchEarnings = async () => {
      try {
        const res = await fetch('/api/earnings');
        const json = await res.json();
        if (json.success) setData(json);
      } catch (err) {
        console.error('Failed to fetch earnings', err);
      }
    };
    fetchEarnings();
    const interval = setInterval(fetchEarnings, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Decentralized Monetization</h1>
          <p className="page-subtitle">Real-time Pay-Per-Inference Economy on Aptos</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, marginBottom: 24 }}>
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Total Network Earnings</div>
            <div style={{ fontSize: 44, fontWeight: 500, letterSpacing: '-.03em', color: 'var(--green)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
              {data ? data.totalEarned : '0.0000'} APT
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
              Velocity: {data ? data.tokenVelocity : '...'}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Live Node Stream</h2>
        </div>
        <div className="card-body">
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Edge Node ID</th>
                  <th>Status</th>
                  <th>Inferences Computed</th>
                  <th>Aptos Earned</th>
                </tr>
              </thead>
              <tbody>
                {data?.nodes.map((node, i) => (
                  <tr key={i}>
                    <td><span className="mono" style={{ fontSize: 13 }}>{node.id}</span></td>
                    <td>
                      <span className="badge badge-green">
                        <i className="hgi-stroke hgi-activity-01" style={{ marginRight: 4 }}></i> {node.status}
                      </span>
                    </td>
                    <td>{node.inferences.toLocaleString()}</td>
                    <td style={{ fontWeight: 500, color: 'var(--green)' }}>+{node.earnedApt} APT</td>
                  </tr>
                ))}
                {!data && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                      Connecting to Aptos Pay-Per-Inference Gateway...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
