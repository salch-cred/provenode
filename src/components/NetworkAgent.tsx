import React, { useState, useEffect } from 'react';

export default function NetworkAgent() {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [messages, setMessages] = useState<{role: 'user'|'agent', content: string}[]>([
    {role: 'agent', content: 'Network telemetry agent connected. Monitoring Shelby Protocol via MCP.'}
  ]);
  const [input, setInput] = useState('');

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Prevent body scroll when open on mobile
  useEffect(() => {
    if (isMobile) document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open, isMobile]);

  const send = async () => {
    if (!input.trim()) return;
    const msg = input.trim();
    setInput('');
    setMessages(p => [...p, {role: 'user', content: msg}]);
    setTimeout(() => {
      let response = "Unrecognized command. Try 'rebalance nodes' or 'status'.";
      if (msg.toLowerCase().includes('rebalance')) {
        response = "MCP Query: AP-South latency > 150ms. Executing erasure coding migration to EU-Central... Transaction confirmed on Aptos L1.";
      } else if (msg.toLowerCase().includes('status')) {
        response = "The Double Zero backbone is operating at 105 Gbps. No pending audits failed.";
      }
      setMessages(p => [...p, {role: 'agent', content: response}]);
    }, 1500);
  };

  /* ── panel geometry ──────────────────────────────────────── */
  const panelStyle: React.CSSProperties = isMobile
    ? {
        position: 'fixed', bottom: 0, left: 0, right: 0,
        height: '55vh', borderRadius: '20px 20px 0 0',
        background: '#fff', border: '1px solid rgba(0,0,0,0.1)',
        boxShadow: '0 -12px 40px rgba(0,0,0,0.18)', zIndex: 10000,
        display: 'flex', flexDirection: 'column',
        animation: 'slideUp 0.25s ease'
      }
    : {
        position: 'fixed', bottom: 110, right: 30, width: 360, height: 460,
        background: '#fff', border: '1px solid rgba(0,0,0,0.1)',
        borderRadius: 14, boxShadow: '0 16px 48px rgba(0,0,0,0.18)', zIndex: 10000,
        display: 'flex', flexDirection: 'column',
        animation: 'fadeInUp 0.2s ease'
      };

  return (
    <>
      {/* Mobile overlay backdrop */}
      {open && isMobile && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.45)', zIndex: 9999
          }}
        />
      )}

      {/* Floating Button */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: 'fixed', bottom: 30, right: 20,
          width: 52, height: 52,
          borderRadius: '50%', background: 'var(--shelby-color, #7c3aed)',
          color: '#fff', border: 'none',
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
          cursor: 'pointer', zIndex: 10001,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}
        aria-label="Open Autonomous Network Agent"
      >
        <i className="hgi-stroke hgi-bot" style={{fontSize: 24}} />
      </button>

      {/* Chat Window */}
      {open && (
        <div style={panelStyle}>
          {/* Header */}
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex', alignItems: 'center', gap: 10,
            flexShrink: 0
          }}>
            {isMobile && (
              <div style={{
                width: 36, height: 4, borderRadius: 2,
                background: 'var(--border-color)', margin: '-4px auto 8px',
                position: 'absolute', top: 10, left: '50%',
                transform: 'translateX(-50%)'
              }} />
            )}
            <i className="hgi-stroke hgi-bot" style={{color:'var(--shelby-color,#7c3aed)', fontSize: 20}}/>
            <div>
              <div style={{fontWeight: 600, fontSize: 14}}>Autonomous Network Agent</div>
              <div style={{fontSize: 11, opacity: 0.6}}>MCP Integration Active</div>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{
                marginLeft: 'auto', background:'none', border:'none',
                color:'var(--text-color)', cursor:'pointer',
                fontSize: 18, lineHeight: 1, padding: '4px 8px'
              }}
              aria-label="Close"
            >✕</button>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1, padding: 14, overflowY: 'auto',
            display: 'flex', flexDirection: 'column', gap: 10
          }}>
            {messages.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                background: m.role === 'user' ? 'var(--shelby-color,#7c3aed)' : 'var(--input-bg)',
                color: m.role === 'user' ? '#fff' : 'var(--text-color)',
                padding: '9px 13px', borderRadius: 8,
                maxWidth: '80%', fontSize: 13, lineHeight: 1.5
              }}>
                {m.content}
              </div>
            ))}
          </div>

          {/* Input */}
          <div style={{
            padding: 12, borderTop: '1px solid var(--border-color)',
            display: 'flex', gap: 8, flexShrink: 0
          }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder="Ask me to rebalance nodes..."
              style={{
                flex: 1, background: 'var(--input-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: 6, padding: '8px 12px',
                color: 'var(--text-color)', fontSize: 13
              }}
            />
            <button
              onClick={send}
              className="btn btn-primary"
              style={{padding: '0 14px', flexShrink: 0}}
            >
              <i className="hgi-stroke hgi-sent" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
