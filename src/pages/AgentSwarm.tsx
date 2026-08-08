import React, { useEffect, useState } from 'react';
import { useToast } from '../contexts/AppContext';

export default function AgentSwarm() {
  const toast = useToast();
  const [agents, setAgents] = useState<any[]>([]);
  const [capacity, setCapacity] = useState(45);
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    // Simulate autonomous agents appearing and moving around
    const interval = setInterval(() => {
      setAgents(prev => {
        const newAgents = [...prev];
        if (newAgents.length < 15 && Math.random() > 0.5) {
          newAgents.push({
            id: `agent-${Math.random().toString(36).substring(2,6)}`,
            x: Math.random() * 100,
            y: Math.random() * 100,
            targetX: Math.random() * 100,
            targetY: Math.random() * 100,
            status: Math.random() > 0.8 ? 'negotiating' : 'active'
          });
        }
        return newAgents.map(a => {
          // move towards target
          const dx = a.targetX - a.x;
          const dy = a.targetY - a.y;
          if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
            a.targetX = Math.random() * 100;
            a.targetY = Math.random() * 100;
            if (a.status !== 'provisioning') {
              a.status = Math.random() > 0.8 ? 'negotiating' : 'active';
            } else if (Math.random() > 0.5) {
               a.status = 'active'; // finished provisioning
            }
          }
          a.x += dx * 0.05;
          a.y += dy * 0.05;
          return a;
        });
      });

      setCapacity(c => {
        const next = c + Math.random() * 2;
        if (next > 90) {
          // Trigger Autonomous Provisioning
          setLogs(l => [`[${new Date().toLocaleTimeString()}] ALERT: Capacity critical (>90%).`, 
                        `[${new Date().toLocaleTimeString()}] Agent-X signed Aptos TX: +500GB Shelby Storage.`, ...l].slice(0, 8));
          toast('Autonomous Agent provisioned 500GB additional Shelby storage via Aptos L1', 'success');
          
          setAgents(prev => {
             const withProv = [...prev];
             if (withProv.length > 0) {
                withProv[0].status = 'provisioning';
                withProv[0].targetX = 50;
                withProv[0].targetY = 50;
             }
             return withProv;
          });
          return 25; // Reset capacity after purchase
        }
        return next;
      });

    }, 1000);
    return () => clearInterval(interval);
  }, [toast]);

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Agent Swarm</h1>
          <p className="page-subtitle">Autonomous AI nodes negotiating resources on Shelbynet</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
        <div className="card" style={{ overflow: 'hidden', height: 500 }}>
          <div style={{ position: 'relative', width: '100%', height: '100%', background: '#0a0a0a' }}>
            {/* Grid background */}
            <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
            
            {/* Agent nodes */}
            {agents.map((a, i) => (
              <div key={i} style={{ 
                position: 'absolute', 
                left: `${a.x}%`, 
                top: `${a.y}%`,
                transform: 'translate(-50%, -50%)',
                transition: 'left 1s linear, top 1s linear'
              }}>
                <div style={{ 
                  width: a.status === 'provisioning' ? 28 : 20, height: a.status === 'provisioning' ? 28 : 20, borderRadius: '50%', 
                  background: a.status === 'provisioning' ? '#ec4899' : a.status === 'negotiating' ? '#fbbf24' : '#60a5fa',
                  boxShadow: `0 0 15px ${a.status === 'provisioning' ? '#ec4899' : a.status === 'negotiating' ? '#fbbf24' : '#60a5fa'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.3s'
                }}>
                  <i className={a.status === 'provisioning' ? "hgi-stroke hgi-database-01" : "hgi-stroke hgi-bot"} style={{ fontSize: a.status === 'provisioning' ? 14 : 10, color: '#000' }}></i>
                </div>
                <div style={{ position: 'absolute', top: 30, left: '50%', transform: 'translateX(-50%)', color: a.status === 'provisioning' ? '#ec4899' : '#fff', fontSize: 10, whiteSpace: 'nowrap', opacity: a.status === 'provisioning' ? 1 : 0.7, fontWeight: a.status === 'provisioning' ? 'bold' : 'normal' }}>
                  {a.id} {a.status === 'provisioning' ? '(PROVISIONING)' : `(${a.status})`}
                </div>
              </div>
            ))}
            
            {agents.length === 0 && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
                Initializing Agent Swarm Protocol...
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Global Storage Capacity</span>
            </div>
            <div className="card-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                <span>Shelby Blob Usage</span>
                <span style={{ fontWeight: 600, color: capacity > 80 ? '#ef4444' : 'var(--text-primary)' }}>{capacity.toFixed(1)}%</span>
              </div>
              <div style={{ width: '100%', height: 10, background: 'var(--border)', borderRadius: 5, overflow: 'hidden', marginBottom: 16 }}>
                <div style={{ width: `${capacity}%`, height: '100%', background: capacity > 80 ? '#ef4444' : 'var(--primary)', transition: 'width 0.5s ease-out, background 0.5s' }} />
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                When global dataset capacity exceeds 90%, the swarm autonomously provisions an Aptos L1 transaction to rent more Shelby storage nodes.
              </p>
            </div>
          </div>

          <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div className="card-header">
              <span className="card-title">Autonomous Action Log</span>
            </div>
            <div className="card-body" style={{ flex: 1, overflowY: 'auto', background: 'var(--surface-hover)', margin: 12, borderRadius: 8, padding: 12, fontFamily: 'var(--font-mono)', fontSize: 11, color: '#34d399', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {logs.length === 0 ? (
                <div style={{ opacity: 0.5, textAlign: 'center', marginTop: 20 }}>Listening for on-chain events...</div>
              ) : (
                logs.map((l, i) => (
                  <div key={i} style={{ borderBottom: '1px solid rgba(16,185,129,0.1)', paddingBottom: 6 }}>{l}</div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
