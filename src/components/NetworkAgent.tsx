import React, { useState, useEffect } from 'react';
import { post } from '../lib/api';

/* ── Rich data types ─────────────────────────────────────────────────────── */
type ToolResult = Record<string, any>;

interface AgentMessage {
  role: 'user' | 'agent';
  content: string;
  data?: ToolResult;
}

function fmtCell(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') { try { const s = JSON.stringify(v); return s.length > 40 ? s.slice(0, 40) + '…' : s; } catch { return '[object]'; } }
  return String(v);
}

function MiniTable({ title, rows }: { title: string; rows: any[] }) {
  if (!rows || !rows.length) return null;
  const cols: string[] = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
  return (
    <div style={{ marginTop: 8, border: '1px solid var(--border-color)', borderRadius: 8, overflow: 'hidden', maxWidth: '100%' }}>
      <div style={{ padding: '5px 10px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.6, borderBottom: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.03)' }}>{title} · {rows.length}</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
          <thead>
            <tr>
              {cols.map(c => <th key={c} style={{ textAlign: 'left', padding: '5px 8px', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap', opacity: 0.7 }}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 8).map((r, i) => (
              <tr key={i}>
                {cols.map(c => <td key={c} style={{ padding: '5px 8px', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap' }}>{fmtCell(r[c])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatChips({ items }: { items: [string, unknown][] }) {
  if (!items.length) return null;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
      {items.map(([label, val]) => (
        <div key={label} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px', textAlign: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>{fmtCell(val)}</div>
          <div style={{ fontSize: 10, opacity: 0.6 }}>{label}</div>
        </div>
      ))}
    </div>
  );
}

function KVList({ title, obj }: { title: string; obj: any }) {
  const entries = Object.entries(obj || {}).filter(([, v]) => v !== undefined && v !== null && typeof v !== 'object');
  if (!entries.length) return null;
  return (
    <div style={{ marginTop: 8, border: '1px solid var(--border-color)', borderRadius: 8, padding: '6px 10px', fontSize: 11 }}>
      <div style={{ fontWeight: 600, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5, opacity: 0.6, marginBottom: 4 }}>{title}</div>
      {entries.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '1px 0' }}>
          <span style={{ opacity: 0.6 }}>{k}</span>
          <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{fmtCell(v)}</span>
        </div>
      ))}
    </div>
  );
}

function AgentRichData({ data }: { data?: ToolResult }) {
  if (!data || !Object.keys(data).length) return null;
  const out: React.ReactNode[] = [];
  if (data.get_platform_summary) out.push(<StatChips key="summary" items={[['Models', data.get_platform_summary?.models], ['Deployments', data.get_platform_summary?.deployments], ['Devices', data.get_platform_summary?.devices]]} />);
  if (data.list_deployments?.deployments) out.push(<MiniTable key="deps" title="Deployments" rows={data.list_deployments.deployments} />);
  if (data.get_fleet_status?.devices) out.push(<MiniTable key="fleet" title="Fleet Devices" rows={data.get_fleet_status.devices} />);
  if (data.list_models?.models) out.push(<MiniTable key="models" title="Models" rows={data.list_models.models} />);
  if (data.get_registry_status) out.push(<KVList key="registry" title="On-chain Registry" obj={data.get_registry_status} />);
  if (data.get_earnings) {
    const e = data.get_earnings;
    out.push(<StatChips key="earnings" items={[['Total earned', e.totalShelbyUSD], ['Settlements', e.settlements]]} />);
    if (e.earnings?.length) out.push(<MiniTable key="earnings-table" title="Earnings" rows={e.earnings} />);
  }
  if (data.list_marketplace_listings?.listings) out.push(<MiniTable key="listings" title="Marketplace Listings" rows={data.list_marketplace_listings.listings} />);
  if (data.list_payment_intents?.intents) out.push(<MiniTable key="payments" title="Payment Intents" rows={data.list_payment_intents.intents} />);
  return <>{out}</>;
}

export default function NetworkAgent() {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [messages, setMessages] = useState<AgentMessage[]>([
    { role: 'agent', content: 'Network telemetry agent connected. Ask about models, deployments, fleet devices, or the on-chain registry.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

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
    if (!input.trim() || loading) return;
    const msg = input.trim();
    setInput('');
    setMessages(p => [...p, { role: 'user', content: msg }]);
    setLoading(true);

    try {
      const res = await post<{ response: string; data?: ToolResult }>('/api/agent', { message: msg });
      setMessages(p => [...p, { role: 'agent', content: res.response || 'No response.', data: res.data }]);
    } catch (e: any) {
      setMessages(p => [...p, { role: 'agent', content: 'Error contacting agent endpoint: ' + e.message }]);
    } finally {
      setLoading(false);
    }
  };

  /* ── panel geometry ─────────────────────────── */
  const panelStyle: React.CSSProperties = isMobile
    ? {
        position: 'fixed', bottom: 0, left: 0, right: 0,
        height: '55vh', borderRadius: '18px 18px 0 0',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderBottom: 'none',
        boxShadow: '0 -12px 40px rgba(23,21,20,0.16)', zIndex: 10000,
        display: 'flex', flexDirection: 'column',
        animation: 'slideUp 0.3s cubic-bezier(.16,1,.3,1)'
      }
    : {
        position: 'fixed', bottom: 110, right: 30, width: 360, height: 460,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 14, boxShadow: '0 24px 64px rgba(23,21,20,0.18)', zIndex: 10000,
        display: 'flex', flexDirection: 'column',
        animation: 'fadeInUp 0.3s cubic-bezier(.16,1,.3,1)'
      };

  return (
    <>
      {/* Mobile overlay backdrop */}
      {open && isMobile && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(23,21,20,0.32)', zIndex: 9999 }}
        />
      )}

      {/* Floating Button - Only show when closed */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', bottom: 30, right: 20,
            width: 52, height: 52,
            borderRadius: '50%', background: 'var(--text-primary)',
            color: '#FAFAF8', border: '1px solid var(--text-primary)',
            boxShadow: '0 10px 28px rgba(23,21,20,0.28)',
            cursor: 'pointer', zIndex: 10001,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'pulse 3s infinite'
          }}
          aria-label="Open Autonomous Network Agent"
        >
          <i className="hgi-stroke hgi-bot" style={{fontSize: 24}} />
        </button>
      )}

      {/* Chat Window */}
      {open && (
        <div style={panelStyle}>
          {/* Header */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {isMobile && (
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border-color)', margin: '-4px auto 8px', position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)' }} />
            )}
            <i className="hgi-stroke hgi-bot" style={{color:'var(--shelby-color)', fontSize: 20}}/>
            <div>
              <div style={{fontWeight: 600, fontSize: 13.5}}>Autonomous Network Agent</div>
              <div style={{fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5}}>
                <span style={{width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block'}} />
                Live platform data
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{ marginLeft: 'auto', background:'none', border:'none', color:'var(--text-color)', cursor:'pointer', fontSize: 18, lineHeight: 1, padding: '4px 8px' }}
              aria-label="Close"
            >✕</button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, padding: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                background: m.role === 'user' ? 'var(--text-primary)' : 'var(--surface-hover)',
                color: m.role === 'user' ? '#FAFAF8' : 'var(--text-color)',
                padding: '9px 13px', borderRadius: 12,
                maxWidth: '80%', fontSize: 13, lineHeight: 1.55
              }}>
                <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.content}</div>
                {m.role === 'agent' && <AgentRichData data={m.data} />}
              </div>
            ))}
            {loading && (
              <div style={{ alignSelf: 'flex-start', background: 'var(--surface-hover)', color: 'var(--text-color)', padding: '9px 13px', borderRadius: 12, fontSize: 13, opacity: 0.7 }}>…</div>
            )}
          </div>

          {/* Input */}
          <div style={{ padding: 12, borderTop: '1px solid var(--border-color)', display: 'flex', gap: 8, flexShrink: 0 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder="Ask me about models, deployments, fleet..."
              style={{ flex: 1, background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '8px 12px', color: 'var(--text-color)', fontSize: 13 }}
            />
            <button
              onClick={send}
              className="btn btn-primary"
              style={{padding: '0 14px', flexShrink: 0}}
              disabled={loading}
            >
              <i className="hgi-stroke hgi-sent" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
