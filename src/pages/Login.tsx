import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import LatticeBackground from '../components/LatticeBackground';

export default function Login({ noAuth }: { noAuth?: boolean }) {
  const navigate = useNavigate();
  const configured = Boolean(import.meta.env.VITE_PRIVY_APP_ID) && !noAuth;

  if (!configured) {
    return (
      <div className="auth-page">
        <LatticeBackground quiet />
        <div className="auth-card">
          <div className="auth-logo"><div className="dot" />Provenode</div>
          <div className="auth-setup-icon"><i className="hgi-stroke hgi-shield-02" /></div>
          <h1 className="auth-title">Enterprise SSO Required</h1>
          <p className="auth-sub" style={{ marginBottom: 0 }}>
            To enable strict multi-tenant user separation, you must configure <code>VITE_PRIVY_APP_ID</code> in Vercel to activate Web3 SSO.
          </p>
        </div>
      </div>
    );
  }

  return <LoginWithPrivy />;
}

function LoginWithPrivy() {
  const navigate = useNavigate();
  const { login, authenticated, user, ready } = usePrivy();
  const [mode, setMode] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (ready && authenticated) {
      const t = setTimeout(() => navigate('/app/dashboard'), 600);
      return () => clearTimeout(t);
    }
  }, [ready, authenticated, navigate]);

  const doLogin = async (methods: ('email'|'wallet'|'passkey')[], m: string) => {
    setError(''); setMode(m);
    try { await login({ loginMethods: methods } as any); }
    catch (e: any) { if (!e?.message?.includes('cancel')) setError(e?.message || 'Login failed.'); }
    finally { setMode(null); }
  };

  if (authenticated) {
    return (
      <div className="auth-page">
        <LatticeBackground quiet />
        <div className="auth-card auth-success">
          <div className="auth-logo"><div className="dot" />Provenode</div>
          <div className="auth-success-icon"><i className="hgi-stroke hgi-checkmark-circle-02" /></div>
          <h1 className="auth-title">Signed in!</h1>
          <p className="auth-sub">Redirecting to console…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <LatticeBackground quiet />
      <div className="auth-card">
        <div className="auth-logo"><div className="dot" />Provenode</div>
        <h1 className="auth-title">Sign in</h1>
        <p className="auth-sub">Verified AI model deployment on Shelby shelbynet</p>

        {error && <div className="auth-error"><i className="hgi-stroke hgi-alert-02" /> {error}</div>}

        <button className="auth-btn" onClick={() => doLogin(['email'], 'email')} disabled={!!mode}>
          <span className="auth-btn-icon"><i className="hgi-stroke hgi-mail-01" /></span>
          <span className="auth-btn-text"><b>Continue with Email</b><small>One-time code sent to your inbox</small></span>
        </button>

        <button className="auth-btn" onClick={() => doLogin(['passkey'], 'passkey')} disabled={!!mode}>
          <span className="auth-btn-icon"><i className="hgi-stroke hgi-fingerprint-scan" /></span>
          <span className="auth-btn-text"><b>Use Passkey</b><small>Face ID · Touch ID · Security key</small></span>
          <span className="auth-badge">Recommended</span>
        </button>

        <div className="auth-divider"><span /> or connect wallet <span /></div>

        <button className="auth-btn" onClick={() => doLogin(['wallet'], 'wallet')} disabled={!!mode}>
          <span className="auth-btn-icon"><i className="hgi-stroke hgi-wallet-01" /></span>
          <span className="auth-btn-text"><b>Connect Wallet</b><small>MetaMask, WalletConnect, Coinbase</small></span>
        </button>

        <div className="auth-footer">Auth by Privy + wagmi · Non-custodial</div>
      </div>
    </div>
  );
}