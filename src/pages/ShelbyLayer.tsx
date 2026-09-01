import React, { useEffect, useState } from 'react';
import { get } from '../lib/api';

export default function ShelbyLayer() {
  const [status, setStatus] = useState<any>({});
  const [identity, setIdentity] = useState<any>({});
  const [registry, setRegistry] = useState<any>(null);
  const [regErr, setRegErr] = useState<string | null>(null);
  const [checkSha, setCheckSha] = useState('');
  const [checkResult, setCheckResult] = useState<any>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    Promise.all([get<any>('/api/shelby-status').catch(() => ({})), get<any>('/api/identity').catch(() => ({}))])
      .then(([s, i]) => { setStatus(s); setIdentity(i); });
    get<any>('/api/registry/status').then((r) => setRegistry(r.registry)).catch((e) => setRegErr(e.message));
  }, []);

  const runVerify = async () => {
    if (!/^[0-9a-f]{64}$/.test(checkSha.trim())) return;
    setChecking(true); setCheckResult(null);
    try { setCheckResult(await get<any>(`/api/registry/verify?sha256=${checkSha.trim()}`)); }
    catch (e: any) { setCheckResult({ error: e.message }); }
    setChecking(false);
  };

  const connected = status.connected === true;
  const reg = registry;
  const firstTx = reg?.firstRegistration?.tx;

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

      <div className="card mb-4">
        <div className="card-header"><span className="card-title"><i className="hgi-stroke hgi-blockchain-01" /> On-Chain Registry</span><span className="badge badge-shelby">Live Shelbynet</span></div>
        <div className="card-body">
          {regErr ? (
            <div className="text-sm text-muted">Registry unavailable: {regErr}</div>
          ) : reg ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
              <div>
                <div className="text-sm text-muted">Contract</div>
                <div className="mono text-sm">{reg.contractAddress.slice(0, 18)}…{reg.contractAddress.slice(-6)}</div>
                <div className="text-xs text-muted">network {reg.network} · chain {reg.chain?.chainId} · block {Number(reg.chain?.blockHeight).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-sm text-muted">Registered</div>
                <div className="mono" style={{ fontSize: 18 }}>{reg.modelCount} <span className="text-muted text-sm">models</span></div>
                <div className="text-xs text-muted">{reg.datasetCount} datasets · {reg.incidentCount} incidents</div>
              </div>
              <div>
                <div className="text-sm text-muted">First On-Chain Registration</div>
                {firstTx ? (
                  <div>
                    <div className="mono text-sm">{reg.firstRegistration.modelName} · {String(reg.firstRegistration.sha256 || '').slice(0, 14)}…</div>
                    <a className="text-sm" style={{ color: 'var(--shelby-color)' }} href={firstTx.explorerUrl} target="_blank" rel="noreferrer">tx {String(firstTx.hash).slice(0, 18)}… ↗</a>
                  </div>
                ) : <div className="text-sm text-muted">none yet</div>}
              </div>
              <div>
                <div className="text-sm text-muted">Verify a Weights SHA-256 On-Chain</div>
                <div className="flex gap-2 mt-1">
                  <input aria-label="Model SHA-256 to verify" className="input mono" style={{ flex: 1, minWidth: 160 }} placeholder="64-char sha256" value={checkSha} onChange={(e) => setCheckSha(e.target.value)} />
                  <button className="btn btn-primary" onClick={runVerify} disabled={checking || !/^[0-9a-f]{64}$/.test(checkSha.trim())}>{checking ? '…' : 'Verify'}</button>
                </div>
                {checkResult && (
                  <div className={`text-sm mt-1 ${checkResult.error ? 'text-muted' : checkResult.verified ? 'green' : 'red'}`}>
                    {checkResult.error || (checkResult.verified ? `✅ Registered on-chain — contract ${String(checkResult.contractAddress).slice(0, 10)}…` : '❌ Not found in on-chain registry')}
                  </div>
                )}
              </div>
            </div>
          ) : <div className="text-sm text-muted">Loading registry…</div>}
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
