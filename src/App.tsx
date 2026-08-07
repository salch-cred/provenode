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

// Only mounted when PrivyProvider is guaranteed present in the tree (noAuth=false)
function PrivyGuard({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user } = usePrivy();
  React.useEffect(() => {
    if (ready && authenticated && user) {
      localStorage.setItem('tenant', user.id);
    }
  }, [ready, authenticated, user]);
  if (!ready) return <div className="loading-screen"><div className="spin" /></div>;
  if (!authenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AuthGuard({ children, noAuth }: { children: React.ReactNode; noAuth?: boolean }) {
  if (noAuth) return <>{children}</>;
  return <PrivyGuard>{children}</PrivyGuard>;
}

export default function App({ noAuth }: { noAuth?: boolean }) {
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
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}