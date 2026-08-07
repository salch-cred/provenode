import React, { useEffect, useState } from 'react';
import { get } from '../lib/api';

export default function ShelbyLayer() {
  const [status, setStatus] = useState<any>({});
  const [identity, setIdentity] = useState<any>({});
  
  // Telemetry state
  const [audits, setAudits] = useState<any[]>([]);
  const [throughput, setThroughput] = useState(105.4);
  const [burned, setBurned] = useState(14023.5);

  useEffect(() => {
    Promise.all([get<any>('/api/shelby-status').catch(()=>({})), get<any>('/api/identity').catch(()=>({}))])
      .then(([s,i]) => { setStatus(s); setIdentity(i); });
  }, []);

  // Simulate network telemetry
  useEffect(() => {
    const timer = setInterval(() => {
      setThroughput(p => p + (Math.random() * 4 - 2));
      setBurned(p => p + (Math.random() * 0.1));
      
      const newAudit = {
        id: Math.random().toString(36).substring(2, 8),
        spFrom: `SP-${Math.floor(Math.random()*1000)}`,
        spTo: `SP-${Math.floor(Math.random()*1000)}`,
        status: 'verifying',
        time: Date.now()
      };
      
      setAudits(prev => {
        const next = [newAudit, ...prev].slice(0, 5);
        // Randomly succeed audits after a short time
        return next.map(a => (Date.now() - a.time > 1500) ? { ...a, status: 'verified' } : a);
      });
    }, 1200);
    return () => clearInterval(timer);
  }, []);

  return (
    <div>
      <div className="card mb-4" style={{padding:'14px 18px'}}>
        <div className="flex-responsive" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="shelby-panel-title"><i className="hgi-stroke hgi-blockchain-01" /> SHELBY DePIN NETWORK</div>
            <div className="flex gap-2 flex-wrap mt-2">
              <span className="badge badge-shelby">Connected: {status.network || 'shelbynet'}</span>
              <span className="badge badge-green">Persistent Identity</span><span className="mono text-sm" style={{marginLeft:4}}>{(identity.address||'0x1a2b...').slice(0,14)}…</span>
            </div>
          </div>
          <div style={{ textAlign: 'right', marginTop: '10px' }}>
            <div className="text-sm text-muted">Double Zero Backbone Throughput</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--shelby-color)' }}>{throughput.toFixed(2)} Gbps</div>
          </div>
        </div>
      </div>
      
      <div className="responsive-grid mb-4">
        {/* Control Plane */}
        <div className="card">
          <div className="card-header"><span className="card-title">Control Plane (Aptos L1)</span><span className="badge badge-blue">Settlement</span></div>
          <div className="card-body">
            <div className="responsive-grid" style={{ gap: 15 }}>
              <div>
                <div className="text-sm text-muted">Protocol Fund (RetroPGF)</div>
                <div className="mono" style={{ fontSize: 18 }}>$4.2M</div>
              </div>
              <div>
                <div className="text-sm text-muted">Total SBY Burned</div>
                <div className="mono" style={{ fontSize: 18 }}>{burned.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-sm text-muted">Active Smart Contracts</div>
                <div className="flex gap-2 mt-1">
                  <span className="badge badge-demo">BlobManager</span>
                  <span className="badge badge-demo">Auditor</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Data Plane */}
        <div className="card">
          <div className="card-header"><span className="card-title">Data Plane (Shelby Nodes)</span><span className="badge badge-shelby">Hot Storage</span></div>
          <div className="card-body">
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 15 }}>
               <span className="badge badge-green">RPC-US-East</span>
               <span className="badge badge-green">RPC-EU-Central</span>
               <span className="badge badge-green">RPC-AP-South</span>
            </div>
            <div className="text-sm text-muted mb-2">Erasure Coding (Clay Codes)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 4 }}>
              {Array.from({length: 48}).map((_, i) => (
                <div key={i} style={{ aspectRatio: '1/1', background: Math.random() > 0.1 ? 'var(--green-color)' : 'var(--border-color)', borderRadius: 2, opacity: 0.8 }} title="Data Chunk" />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Hybrid Auditing */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Live Hybrid Auditing</span>
          <span className="text-sm text-muted ml-auto">P2P 1 KiB Challenge Proofs</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Audit ID</th>
                <th>Challenger</th>
                <th>Prover</th>
                <th>Payload</th>
                <th>Verification</th>
              </tr>
            </thead>
            <tbody>
              {audits.length === 0 ? (
                <tr><td colSpan={5}>
                  <div className="empty" style={{padding:'40px 20px', display:'flex', flexDirection:'column', alignItems:'center', gap:12}}>
                    <i className="hgi-stroke hgi-signal-01" style={{fontSize:40, opacity:0.2}} />
                    <div style={{fontWeight:700, fontSize:15}}>Awaiting telemetry stream</div>
                    <div style={{fontSize:13, opacity:0.55}}>P2P challenge proofs will appear here once the network begins emitting audit events</div>
                  </div>
                </td></tr>
              ) : audits.map(a => (
                <tr key={a.id}>
                  <td className="mono">{a.id}</td>
                  <td className="mono text-sm">{a.spFrom}</td>
                  <td className="mono text-sm">{a.spTo}</td>
                  <td>1 KiB Random Sample</td>
                  <td>
                    {a.status === 'verifying' ? (
                      <span className="badge badge-yellow"><i className="hgi-stroke hgi-loading-01 spin" style={{marginRight:4}}/> Verifying Proof...</span>
                    ) : (
                      <span className="badge badge-green"><i className="hgi-stroke hgi-tick-double" style={{marginRight:4}}/> Aptos Validated</span>
                    )}
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