import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Layout from './components/Layout';
import Verify from './pages/Verify';
import Dashboard from './pages/Dashboard';
import Deploy from './pages/Deploy';
import Import from './pages/Import';
import Registry from './pages/Registry';
import Lineage from './pages/Lineage';
import ABTest from './pages/ABTest';
import Devices from './pages/Devices';
import Fleet from './pages/Fleet';
import ShelbyLayer from './pages/ShelbyLayer';
import ObjectsPage from './pages/ObjectsPage';
import Compliance from './pages/Compliance';
import Webhooks from './pages/Webhooks';
import Marketplace from './pages/Marketplace';
import Analytics from './pages/Analytics';
import Schedule from './pages/Schedule';
import Groups from './pages/Groups';
import Bluegreen from './pages/Bluegreen';
import Audit from './pages/Audit';
import Integrity from './pages/Integrity';
import Datasets from './pages/Datasets';
import Federated from './pages/Federated';
import Streaming from './pages/Streaming';
import Distillation from './pages/Distillation';
import Health from './pages/Health';
import Governance from './pages/Governance';
import ZKValidator from './pages/ZKValidator';
import Earnings from './pages/Earnings';
import AgentSwarm from './pages/AgentSwarm';
import ThreatMap from './pages/ThreatMap';
import FHE from './pages/FHE';
import Replication from './pages/Replication';

// Only mounted when PrivyProvider is guaranteed present in the tree (noAuth=false)
function PrivyGuard({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user } = usePrivy();
  React.useEffect(() => {
    if (ready && authenticated && user) {
      localStorage.setItem('tenant', user.id);
    }
  }, [ready, authenticated, user]);
  if (!ready) return null;
  return <>{children}</>;
}

// AuthGuard redirects unauthenticated users to /login
function AuthGuard({ children, noAuth }: { children: React.ReactNode; noAuth?: boolean }) {
  const { ready, authenticated } = usePrivy();
  if (noAuth) return <>{children}</>;
  if (!ready) return <div className="page fade-in" style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh'}}><div className="spin" /></div>;
  if (!authenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App({ noAuth: externalNoAuth }: { noAuth?: boolean }) {
  // Auth is ON unless explicitly disabled: VITE_NO_AUTH=true (Vite) or REACT_APP_NO_AUTH=true.
  // Previously this defaulted to `true`, which made the entire /app/* console public
  // and bypassed Privy SSO even when VITE_PRIVY_APP_ID was configured.
  const envNoAuth = import.meta.env.VITE_NO_AUTH === 'true' || (import.meta as any).env?.REACT_APP_NO_AUTH === 'true';
  const noAuth = externalNoAuth !== undefined ? externalNoAuth : envNoAuth;

  return (
    <Routes>
      <Route path="/"       element={<Landing />} />
      <Route path="/login"  element={<Login noAuth={noAuth} />} />
      <Route path="/verify" element={<Verify />} />
      <Route path="/app/*"  element={<AuthGuard noAuth={noAuth}><Layout /></AuthGuard>}>
        <Route index                element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard"     element={<Dashboard />} />
        <Route path="deploy"        element={<Deploy />} />
        <Route path="import"        element={<Import />} />
        <Route path="registry"      element={<Registry />} />
        <Route path="lineage"       element={<Lineage />} />
        <Route path="abtest"        element={<ABTest />} />
        <Route path="devices"       element={<Devices />} />
        <Route path="fleet"         element={<Fleet />} />
        <Route path="shelby"        element={<ShelbyLayer />} />
        <Route path="objects"       element={<ObjectsPage />} />
        <Route path="compliance"    element={<Compliance />} />
        <Route path="webhooks"      element={<Webhooks />} />
        <Route path="marketplace"   element={<Marketplace />} />
        <Route path="analytics"     element={<Analytics />} />
        <Route path="schedule"      element={<Schedule />} />
        <Route path="groups"        element={<Groups />} />
        <Route path="bluegreen"     element={<Bluegreen />} />
        <Route path="audit"         element={<Audit />} />
        <Route path="integrity"     element={<Integrity />} />
        <Route path="datasets"      element={<Datasets />} />
        <Route path="federated"     element={<Federated />} />
        <Route path="streaming"     element={<Streaming />} />
        <Route path="distillation"  element={<Distillation />} />
        <Route path="health"        element={<Health />} />
        <Route path="governance"    element={<Governance />} />
        <Route path="zkvalidator"   element={<ZKValidator />} />
        <Route path="earnings"      element={<Earnings />} />
        <Route path="agents"        element={<AgentSwarm />} />
        <Route path="threats"       element={<ThreatMap />} />
        <Route path="fhe"           element={<FHE />} />
        <Route path="replication"   element={<Replication />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}