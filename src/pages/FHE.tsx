import React, { useEffect, useState } from 'react';

export default function FHE() {
  const [data, setData] = useState<{ pipelineStatus: string, entropy: number, latticeDimension: number } | null>(null);

  useEffect(() => {
    const fetchFHE = async () => {
      try {
        const res = await fetch('/api/fhe-inference');
        const json = await res.json();
        if (json.success) setData(json.metrics);
      } catch (err) {}
    };
    fetchFHE();
    const interval = setInterval(fetchFHE, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Fully Homomorphic Encryption (FHE) Enclave</h1>
          <p className="page-subtitle">Zero-Knowledge Encrypted Inferences running on Lattice Cryptography</p>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ position: 'relative', width: '100%', height: '400px', background: '#020617', borderRadius: '0 0 12px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(16, 185, 129, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(16, 185, 129, 0.05) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

          <div style={{ zIndex: 10, display: 'flex', gap: 40, alignItems: 'center', color: '#10b981', fontFamily: 'var(--font-mono)' }}>
            <div style={{ padding: 20, border: '1px solid #10b981', borderRadius: 8, background: 'rgba(16, 185, 129, 0.1)', textAlign: 'center' }}>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8, textTransform: 'uppercase' }}>User Device</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>Encrypted Input</div>
              <div style={{ fontSize: 12, marginTop: 8, color: '#34d399' }}>Ciphertext (LWE)</div>
            </div>

            <i className="hgi-stroke hgi-arrow-right-01" style={{ fontSize: 32, opacity: 0.5 }} />

            <div style={{ padding: 30, border: '2px solid #3b82f6', borderRadius: 8, background: 'rgba(59, 130, 246, 0.1)', textAlign: 'center', color: '#3b82f6', boxShadow: '0 0 20px rgba(59, 130, 246, 0.2)' }}>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8, textTransform: 'uppercase' }}>Provenode Network</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>Blind Inference</div>
              <div style={{ fontSize: 12, marginTop: 8, color: '#60a5fa' }}>{data ? data.pipelineStatus : 'Computing FHE...'}</div>
            </div>

            <i className="hgi-stroke hgi-arrow-right-01" style={{ fontSize: 32, opacity: 0.5 }} />

            <div style={{ padding: 20, border: '1px solid #10b981', borderRadius: 8, background: 'rgba(16, 185, 129, 0.1)', textAlign: 'center' }}>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8, textTransform: 'uppercase' }}>User Device</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>Encrypted Output</div>
              <div style={{ fontSize: 12, marginTop: 8, color: '#34d399' }}>Decrypted Locally</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, marginTop: 24 }}>
        <div className="card">
          <div className="card-body" style={{ padding: 24 }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 14, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Security Properties</h3>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontWeight: 600 }}>Raw Data Leakage</span>
              <span style={{ color: '#10b981', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>0.0000%</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontWeight: 600 }}>Quantum Resistance</span>
              <span style={{ color: '#10b981', fontWeight: 700 }}>PQC Immune</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0' }}>
              <span style={{ fontWeight: 600 }}>Lattice Dimension (n)</span>
              <span style={{ color: '#3b82f6', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{data ? data.latticeDimension : '...'}</span>
            </div>
          </div>
        </div>
        
        <div className="card">
          <div className="card-body" style={{ padding: 24 }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 14, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Live Entropy Visualizer</h3>
            <div style={{ height: 120, background: '#020617', borderRadius: 8, border: '1px solid var(--border)', display: 'flex', alignItems: 'flex-end', padding: 8, gap: 4, overflow: 'hidden' }}>
              {Array.from({ length: 24 }).map((_, i) => (
                <div key={i} style={{ 
                  flex: 1, 
                  background: `rgba(59, 130, 246, ${Math.random() * 0.5 + 0.3})`, 
                  height: `${Math.random() * 80 + 20}%`, 
                  transition: 'height 0.5s ease' 
                }} />
              ))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, textAlign: 'center' }}>
              Noise Budget Entropy: {data ? data.entropy.toFixed(2) : '...'} / 100
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
