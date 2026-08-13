import React, { useEffect, useState } from 'react';
import { get } from '../lib/api';

export default function ShelbyLayer() {
  const [status, setStatus] = useState<any>({});
  const [identity, setIdentity] = useState<any>({});

  useEffect(() => {
    Promise.all([get<any>('/api/shelby-status').catch(() => ({})), get<any>('/api/identity').catch(() => ({}))])
      .then(([s, i]) => { setStatus(s); setIdentity(i); });
  }, []);

  const connected = status.connected === true;

  return (
    <div>
      <div className="card mb-4" style={{ padding: '14px 18px' }}>
        <div className="flex-responsive" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="shelby-panel-title"><i className="hgi-stroke hgi-blockchain-01" /> SHELBY DEPIN NETWORK</div>
            <div className="flex gap-2 flex-wrap mt-2">
              {connected
                ? <span className="badge badge-shelby"><div className="dot-live" /> Connected: {status.network || 'shelbynet'}</span>
                : <span className="badge badge-red">Unconfigured — set SHELBY_API_KEY</span>}
              <span className="badge badge-green">Persistent Identity</span>
              <span className="mono text-sm" style={{ marginLeft: 4 }}>{identity.address ? `${identity.address.slice(0, 14)}…` : 'no SHELBY_PRIVATE_KEY'}</span>
            </div>
          </div>
          <div style={{ textAlign: 'right', marginTop: '10px' }}>
            <div className="text-sm text-muted">API Endpoint</div>
            <div className="mono text-sm" style={{ color: 'var(--shelby-color)' }}>{status.apiUrl || '—'}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Network Configuration</span><span className={`badge ${connected ? 'badge-shelby' : 'badge-red'}`}>{status.mode || 'unknown'}</span></div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <div>
              <div className="text-sm text-muted">Network</div>
              <div className="mono" style={{ fontSize: 16 }}>{status.network || '—'}</div>
            </div>
            <div>
              <div className="text-sm text-muted">Connected</div>
              <div className="mono" style={{ fontSize: 16 }}>{connected ? 'yes' : 'no'}</div>
            </div>
            <div>
              <div className="text-sm text-muted">Persistent Identity</div>
              <div className="mono" style={{ fontSize: 16 }}>{identity.configured === false ? 'not configured' : (identity.address ? 'configured' : (status.persistentIdentity ? 'configured' : 'no'))}</div>
            </div>
            <div>
              <div className="text-sm text-muted">Org Address</div>
              <div className="mono text-sm">{identity.address || '—'}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
