import React, { useEffect, useState } from 'react';

export default function ThreatMap() {
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    const fetchThreats = async () => {
      try {
        const res = await fetch('/api/threats');
        const json = await res.json();
        if (json.success) setEvents(json.events);
      } catch (err) {
        console.error('Failed to fetch threats', err);
      }
    };
    fetchThreats();
    const interval = setInterval(fetchThreats, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Global Threat Map</h1>
          <p className="page-subtitle">Real-time visualization of DDOS attempts and dynamic routing</p>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ position: 'relative', width: '100%', height: '500px', background: '#050510', borderRadius: '0 0 12px 12px' }}>
          
          {/* Mock World Map Background */}
          <div style={{ position: 'absolute', inset: 0, opacity: 0.15, backgroundImage: 'url(https://upload.wikimedia.org/wikipedia/commons/8/80/World_map_-_low_resolution.svg)', backgroundSize: 'cover', backgroundPosition: 'center', filter: 'invert(1)' }} />
          
          <div style={{ position: 'absolute', top: 20, left: 20, background: 'rgba(0,0,0,0.7)', padding: '10px 15px', borderRadius: 8, border: '1px solid #333' }}>
            <div style={{ color: '#ef4444', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#ef4444', marginRight: 8, animation: 'pulse 1s infinite' }} />
              Active Defenses
            </div>
          </div>

          <div style={{ position: 'absolute', inset: 40, display: 'flex', flexDirection: 'column', gap: 12, justifyContent: 'flex-end', pointerEvents: 'none' }}>
            {events.map((evt, i) => (
              <div key={i} style={{ 
                background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', 
                color: '#fca5a5', padding: '12px 16px', borderRadius: 8, fontSize: 13, display: 'flex', justifyContent: 'space-between', backdropFilter: 'blur(4px)',
                animation: 'fade-up 0.5s ease-out forwards'
              }}>
                <div>
                  <strong style={{ color: '#ef4444', textTransform: 'uppercase' }}>[{evt.type}]</strong> — {evt.region}
                </div>
                <div style={{ opacity: 0.7 }}>Target IP: {evt.ip}</div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
