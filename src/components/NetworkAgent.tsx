import React, { useState } from 'react';

export default function NetworkAgent() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<{role: 'user'|'agent', content: string}[]>([
    {role: 'agent', content: 'Network telemetry agent connected. Monitoring Shelby Protocol via MCP.'}
  ]);
  const [input, setInput] = useState('');

  const send = async () => {
    if (!input.trim()) return;
    const msg = input.trim();
    setInput('');
    setMessages(p => [...p, {role: 'user', content: msg}]);

    setTimeout(() => {
      let response = "Unrecognized command. Try 'rebalance nodes'.";
      if (msg.toLowerCase().includes('rebalance')) {
        response = "MCP Query: AP-South latency > 150ms. Executing erasure coding migration to EU-Central... Transaction confirmed on Aptos L1.";
      } else if (msg.toLowerCase().includes('status')) {
        response = "The Double Zero backbone is operating at 105 Gbps. No pending audits failed.";
      }
      setMessages(p => [...p, {role: 'agent', content: response}]);
    }, 1500);
  };

  return (
    <>
      {/* Floating Button */}
      <button 
        onClick={() => setOpen(!open)}
        style={{
          position: 'fixed', bottom: 30, right: 30, width: 60, height: 60, 
          borderRadius: '50%', background: 'var(--shelby-color)', color: '#fff', 
          border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.2)', cursor: 'pointer', zIndex: 9999
        }}>
        <i className="hgi-stroke hgi-bot" style={{fontSize: 28}} />
      </button>

      {/* Chat Window */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 110, right: 30, width: 350, height: 450, 
          background: 'var(--card-bg)', border: '1px solid var(--border-color)', 
          borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.3)', zIndex: 9999,
          display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ padding: 15, borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <i className="hgi-stroke hgi-bot text-xl" style={{color: 'var(--shelby-color)'}}/>
            <div>
              <div style={{fontWeight: 600}}>Autonomous Network Agent</div>
              <div className="text-sm text-muted">MCP Integration Active</div>
            </div>
            <button onClick={() => setOpen(false)} style={{marginLeft: 'auto', background:'none', border:'none', color:'var(--text-color)', cursor:'pointer'}}>✖</button>
          </div>
          
          <div style={{ flex: 1, padding: 15, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ 
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                background: m.role === 'user' ? 'var(--primary-color)' : 'var(--input-bg)',
                color: m.role === 'user' ? '#fff' : 'var(--text-color)',
                padding: '10px 14px', borderRadius: 8, maxWidth: '80%', fontSize: 14, lineHeight: 1.4
              }}>
                {m.content}
              </div>
            ))}
          </div>

          <div style={{ padding: 15, borderTop: '1px solid var(--border-color)', display: 'flex', gap: 10 }}>
            <input 
              value={input} 
              onChange={e => setInput(e.target.value)} 
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder="Ask me to rebalance nodes..." 
              style={{ flex: 1, background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '8px 12px', color: 'var(--text-color)' }}
            />
            <button onClick={send} className="btn btn-primary" style={{padding: '0 15px'}}><i className="hgi-stroke hgi-sent" /></button>
          </div>
        </div>
      )}
    </>
  );
}
