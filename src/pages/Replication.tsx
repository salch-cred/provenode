import React, { useEffect, useState, useRef } from 'react';

// Basic regional centers (percentages on a 100x100 canvas)
const regions = [
  { id: 'NA-East', x: 25, y: 35 },
  { id: 'NA-West', x: 15, y: 32 },
  { id: 'EU-West', x: 48, y: 28 },
  { id: 'EU-Central', x: 55, y: 30 },
  { id: 'Asia-East', x: 80, y: 38 },
  { id: 'Asia-South', x: 70, y: 45 },
  { id: 'SA-East', x: 35, y: 65 },
  { id: 'Oceania', x: 85, y: 75 },
];

export default function Replication() {
  const [activeLines, setActiveLines] = useState<any[]>([]);
  const [activeNodes, setActiveNodes] = useState<string[]>([]);
  const [metrics, setMetrics] = useState({
    activeBlobs: 14205,
    replicationFactor: 3.0,
    networkHealth: 99.9,
    throughput: 1.4
  });

  useEffect(() => {
    // Simulate replication bursts
    const interval = setInterval(() => {
      // Pick random source and multiple destinations
      const source = regions[Math.floor(Math.random() * regions.length)];
      
      const numDests = Math.floor(Math.random() * 3) + 1;
      const dests = [];
      for (let i=0; i<numDests; i++) {
        let d = regions[Math.floor(Math.random() * regions.length)];
        if (d.id !== source.id) dests.push(d);
      }

      if (dests.length > 0) {
        const id = Math.random().toString(36);
        const newLines = dests.map((d, i) => ({
          id: id + i,
          x1: source.x, y1: source.y,
          x2: d.x, y2: d.y,
        }));
        
        setActiveLines(prev => [...prev, ...newLines].slice(-15)); // keep last 15
        
        setActiveNodes(prev => {
           const nodes = new Set(prev);
           nodes.add(source.id);
           dests.forEach(d => nodes.add(d.id));
           return Array.from(nodes).slice(-6);
        });

        setMetrics(m => ({
          ...m,
          activeBlobs: m.activeBlobs + Math.floor(Math.random() * 10),
          throughput: +(Math.random() * 2 + 1).toFixed(1)
        }));
      }
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Global Replication Heatmap</h1>
          <p className="page-subtitle">Real-time geographical distribution of FHE encrypted blobs across Shelby nodes</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
        
        {/* Heatmap Area */}
        <div className="card" style={{ height: 600, overflow: 'hidden', background: '#050505', position: 'relative' }}>
           {/* Abstract Dot Grid Map Simulation */}
           <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.15) 1px, transparent 1px)', backgroundSize: '20px 20px', opacity: 0.3 }} />
           
           <svg style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}>
              {/* Lines */}
              {activeLines.map(line => (
                 <line 
                   key={line.id} 
                   x1={`${line.x1}%`} y1={`${line.y1}%`} 
                   x2={`${line.x2}%`} y2={`${line.y2}%`} 
                   stroke="url(#gradient)" strokeWidth="2"
                   className="pulse-line"
                 />
              ))}
              <defs>
                 <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#ec4899" />
                    <stop offset="100%" stopColor="#8b5cf6" />
                 </linearGradient>
              </defs>
           </svg>

           {/* Nodes */}
           {regions.map(r => (
             <div key={r.id} style={{
                position: 'absolute',
                left: `${r.x}%`,
                top: `${r.y}%`,
                transform: 'translate(-50%, -50%)',
                display: 'flex', flexDirection: 'column', alignItems: 'center'
             }}>
                <div style={{
                  width: activeNodes.includes(r.id) ? 16 : 10,
                  height: activeNodes.includes(r.id) ? 16 : 10,
                  borderRadius: '50%',
                  background: activeNodes.includes(r.id) ? '#ec4899' : '#3b82f6',
                  boxShadow: activeNodes.includes(r.id) ? '0 0 20px #ec4899' : '0 0 10px #3b82f6',
                  transition: 'all 0.3s ease'
                }} />
                <span style={{
                  marginTop: 6, fontSize: 10, fontWeight: 'bold', color: activeNodes.includes(r.id) ? '#fff' : '#666',
                  transition: 'color 0.3s', textShadow: '0 2px 4px rgba(0,0,0,0.8)'
                }}>{r.id}</span>
             </div>
           ))}

           <style>{`
             .pulse-line {
               stroke-dasharray: 1000;
               stroke-dashoffset: 1000;
               animation: drawLine 2s forwards linear;
               opacity: 0.7;
             }
             @keyframes drawLine {
               0% { stroke-dashoffset: 1000; opacity: 0; }
               20% { opacity: 0.8; }
               80% { opacity: 0.4; }
               100% { stroke-dashoffset: 0; opacity: 0; }
             }
           `}</style>
        </div>

        {/* Metrics Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <div className="card-header"><span className="card-title">Network Metrics</span></div>
            <div className="card-body" style={{ padding: '20px 16px' }}>
              
              <div style={{ marginBottom: 20 }}>
                 <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total Encrypted Blobs</div>
                 <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>{metrics.activeBlobs.toLocaleString()}</div>
              </div>

              <div style={{ marginBottom: 20 }}>
                 <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Replication Factor</div>
                 <div style={{ fontSize: 24, fontWeight: 600, color: '#34d399' }}>{metrics.replicationFactor.toFixed(1)}x</div>
                 <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Every fragment is stored on {Math.floor(metrics.replicationFactor)} distinct geographic nodes</div>
              </div>

              <div style={{ marginBottom: 20 }}>
                 <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Global Throughput</div>
                 <div style={{ fontSize: 24, fontWeight: 600, color: '#60a5fa' }}>{metrics.throughput.toFixed(1)} GB/s</div>
              </div>

            </div>
          </div>

          <div className="card" style={{ flex: 1 }}>
            <div className="card-header"><span className="card-title">Event Stream</span></div>
            <div className="card-body" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
               {activeLines.slice(-4).reverse().map((line, idx) => {
                 const region = regions.find(r => r.x === line.x2 && r.y === line.y2)?.id;
                 return (
                   <div key={idx} style={{ padding: '8px 12px', background: 'var(--surface-hover)', borderRadius: 6, fontSize: 12 }}>
                     <div style={{ color: '#ec4899', fontWeight: 600, marginBottom: 4 }}>Replication Success</div>
                     <div style={{ color: 'var(--text-muted)' }}>Fragment synced to <strong style={{color:'#fff'}}>{region}</strong> via Shelby Protocol.</div>
                   </div>
                 );
               })}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
