import React, { useEffect, useState } from 'react';

export default function AgentSwarm() {
  const [agents, setAgents] = useState<any[]>([]);

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
            a.status = Math.random() > 0.8 ? 'negotiating' : 'active';
          }
          a.x += dx * 0.05;
          a.y += dy * 0.05;
          return a;
        });
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Agent Swarm</h1>
          <p className="page-subtitle">Autonomous AI nodes negotiating resources on Shelbynet</p>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ position: 'relative', width: '100%', height: '500px', background: '#0a0a0a', borderRadius: '0 0 12px 12px' }}>
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
                width: 20, height: 20, borderRadius: '50%', 
                background: a.status === 'negotiating' ? '#fbbf24' : '#60a5fa',
                boxShadow: `0 0 15px ${a.status === 'negotiating' ? '#fbbf24' : '#60a5fa'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <i className="hgi-stroke hgi-bot" style={{ fontSize: 10, color: '#000' }}></i>
              </div>
              <div style={{ position: 'absolute', top: 25, left: '50%', transform: 'translateX(-50%)', color: '#fff', fontSize: 10, whiteSpace: 'nowrap', opacity: 0.7 }}>
                {a.id} ({a.status})
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
    </div>
  );
}
