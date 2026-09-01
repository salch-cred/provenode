import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import NetworkAgent from './NetworkAgent';

const NAV = [
  { section: 'Operations', items: [
    { to: 'dashboard',   label: 'Dashboard',    icon: 'hgi-dashboard-square-01' },
    { to: 'deploy',      label: 'Deploy Model', icon: 'hgi-rocket-01' },
    { to: 'import',      label: 'HF Import',    icon: 'hgi-cloud-download' },
    { to: 'registry',    label: 'Registry',     icon: 'hgi-database-01' },
  ]},
  { section: 'Intelligence', items: [
    { to: 'integrity',   label: 'Integrity Monitor', icon: 'hgi-shield-02' },
    { to: 'datasets',    label: 'Datasets',     icon: 'hgi-folder-library' },
    { to: 'lineage',     label: 'Lineage',      icon: 'hgi-git-branch' },
    { to: 'abtest',      label: 'A/B Tests',    icon: 'hgi-analytics-01' },
    { to: 'federated',   label: 'Federated',    icon: 'hgi-share-01' },
    { to: 'distillation',label: 'Distillation', icon: 'hgi-ai-brain-01' },
  ]},
  { section: 'Fleet', items: [
    { to: 'devices',     label: 'Devices',      icon: 'hgi-cpu' },
    { to: 'fleet',       label: 'OTA + Canary', icon: 'hgi-refresh' },
    { to: 'groups',      label: 'Groups',       icon: 'hgi-folder-01' },
    { to: 'streaming',   label: 'Streaming',    icon: 'hgi-wifi-01' },
  ]},
  { section: 'Enterprise', items: [
    { to: 'governance',  label: 'Governance',   icon: 'hgi-signature' },
    { to: 'zkvalidator', label: 'ZK Validator', icon: 'hgi-shield-02' },
    { to: 'earnings',    label: 'Monetization', icon: 'hgi-bitcoin-04' },
  ]},
  { section: 'Blockchain', items: [
    { to: 'objects',     label: 'Shelby Objects', icon: 'hgi-package' },
    { to: 'shelby',      label: 'Shelby Layer',   icon: 'hgi-blockchain-01' },
    { to: 'passports',   label: 'Model Passports', icon: 'hgi-license' },
    { to: 'compliance',  label: 'Compliance',     icon: 'hgi-agreement-01' },
    { to: 'bluegreen',   label: 'Blue-Green',     icon: 'hgi-exchange-01' },
  ]},
  { section: 'Growth', items: [
    { to: 'sites',       label: 'Sites',        icon: 'hgi-globe-02' },
    { to: 'marketplace', label: 'Marketplace',  icon: 'hgi-store-01' },
    { to: 'analytics',   label: 'Analytics',    icon: 'hgi-analytics-02' },
    { to: 'schedule',    label: 'Scheduled',    icon: 'hgi-calendar-01' },
  ]},
  { section: 'Resources', items: [
    { to: 'docs',        label: 'Documentation', icon: 'hgi-book-open-01' },
  ]},
  { section: 'Config', items: [
    { to: 'webhooks',    label: 'Webhooks',     icon: 'hgi-plug-01' },
    { to: 'audit',       label: 'Audit Log',    icon: 'hgi-note-01' },
  ]},
];

const TITLES: Record<string,string> = Object.fromEntries(NAV.flatMap(s => s.items.map(i => [i.to, i.label])));

export default function Layout() {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const current = loc.pathname.split('/').pop() || 'dashboard';

  useEffect(() => { setOpen(false); }, [loc.pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
  }, [open]);

  return (
    <div className="app-shell">
      <NetworkAgent />
      {open && <div className="sidebar-overlay show" onClick={() => setOpen(false)} />}

      <nav className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <img src="/provenode-logo.svg" alt="Provenode" style={{ width: 22, height: 22 }} />
          Provenode
        </div>
        {NAV.map(sec => (
          <div className="sidebar-section" key={sec.section}>
            <div className="sidebar-label">{sec.section}</div>
            {sec.items.map(item => item.to === 'docs' ? (
              <a key={item.to} href="/docs/" target="_blank" rel="noreferrer" className="nav-item">
                <span className="icon"><i className={`hgi-stroke ${item.icon}`} /></span>
                {item.label} ↗
              </a>
            ) : (
              <NavLink key={item.to} to={`/app/${item.to}`} className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
                <span className="icon"><i className={`hgi-stroke ${item.icon}`} /></span>
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
        <div className="sidebar-bottom" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button 
            className="btn" 
            style={{ width: '100%', justifyContent: 'center', background: 'transparent', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            onClick={() => {
              localStorage.removeItem('token');
              window.location.href = '/';
            }}
          >
            <i className="hgi-stroke hgi-logout-01" /> Sign Out
          </button>
          <div className="shelby-badge" style={{ marginTop: 0 }}><div className="dot-live" /><span id="sb-badge">SHELBY · LIVE</span></div>
        </div>
      </nav>

      <div className="main">
        <div className="topbar">
          <button className={`menu-btn ${open ? 'open' : ''}`} onClick={() => setOpen(o => !o)} aria-label="Open menu">
            <span />
          </button>
          <h1 style={{fontSize:16,fontWeight:600,letterSpacing:'-.02em',flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
            {TITLES[current] || 'Dashboard'}
          </h1>
          <div className="flex gap-2 items-center">
            <NavLink to="/app/dashboard" className="btn btn-sm desktop-only"><i className="hgi-stroke hgi-home-01" /> Home</NavLink>
            <NavLink to="/app/health" className="btn btn-sm desktop-only"><i className="hgi-stroke hgi-activity-01" /> Health</NavLink>
            <NavLink to="/app/dashboard" className="btn btn-sm mobile-only"><i className="hgi-stroke hgi-home-01" /></NavLink>
          </div>
        </div>
        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}