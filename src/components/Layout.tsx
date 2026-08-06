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
    { to: 'datasets',    label: 'Datasets',      icon: 'hgi-server-01' },
    { to: 'lineage',     label: 'Lineage',      icon: 'hgi-git-branch' },
    { to: 'abtest',      label: 'A/B Tests',    icon: 'hgi-analytics-01' },
    { to: 'federated',   label: 'Federated',    icon: 'hgi-share-01' },
    { to: 'distillation',label: 'Distillation', icon: 'hgi-flask' },
  ]},
  { section: 'Fleet', items: [
    { to: 'devices',     label: 'Devices',      icon: 'hgi-cpu' },
    { to: 'fleet',       label: 'OTA + Canary', icon: 'hgi-refresh' },
    { to: 'groups',      label: 'Groups',       icon: 'hgi-folder-01' },
    { to: 'streaming',   label: 'Streaming',    icon: 'hgi-wifi-01' },
  ]},
  { section: 'Blockchain', items: [
    { to: 'objects',     label: 'Shelby Objects', icon: 'hgi-package' },
    { to: 'shelby',      label: 'Shelby Layer',   icon: 'hgi-blockchain-01' },
    { to: 'compliance',  label: 'Compliance',     icon: 'hgi-shield-01' },
    { to: 'bluegreen',   label: 'Blue-Green',     icon: 'hgi-exchange-01' },
  ]},
  { section: 'Growth', items: [
    { to: 'marketplace', label: 'Marketplace',  icon: 'hgi-store-01' },
    { to: 'analytics',   label: 'Analytics',    icon: 'hgi-analytics-02' },
    { to: 'schedule',    label: 'Scheduled',    icon: 'hgi-calendar-01' },
  ]},
  { section: 'Resources', items: [
    { to: 'docs',        label: 'Documentation', icon: 'hgi-book-open-01' },
  ]},
  { section: 'Config', items: [
    { to: 'webhooks',    label: 'Webhooks',     icon: 'hgi-flash' },
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
        <div className="sidebar-logo"><div className="dot" />Provenode</div>
        {NAV.map(sec => (
          <div className="sidebar-section" key={sec.section}>
            <div className="sidebar-label">{sec.section}</div>
            {sec.items.map(item => item.to === 'docs' ? (
              <a key={item.to} href="https://www.provenodes.xyz/docs" target="_blank" rel="noreferrer" className="nav-item">
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
        <div className="sidebar-bottom">
          <div className="shelby-badge"><div className="dot-live" /><span id="sb-badge">SHELBY · LIVE</span></div>
        </div>
      </nav>

      <div className="main">
        <div className="topbar">
          <button className={`menu-btn ${open ? 'open' : ''}`} onClick={() => setOpen(o => !o)} aria-label="Open menu">
            <span />
          </button>
          <h1 style={{fontSize:15,fontWeight:800,letterSpacing:'-.3px',flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
            {TITLES[current] || 'Dashboard'}
          </h1>
          <div className="flex gap-2 items-center">
            <a href="/" className="btn btn-sm desktop-only"><i className="hgi-stroke hgi-home-01" /> Home</a>
            <a href="/api/health" target="_blank" rel="noreferrer" className="btn btn-sm desktop-only"><i className="hgi-stroke hgi-activity-01" /> Health</a>
            <a href="/" className="btn btn-sm mobile-only"><i className="hgi-stroke hgi-home-01" /></a>
          </div>
        </div>
        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}