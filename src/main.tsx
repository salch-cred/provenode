import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { PrivyProvider } from '@privy-io/react-auth';
import { WagmiProvider } from '@privy-io/wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, createConfig } from 'wagmi';
import { mainnet, polygon, arbitrum, base } from 'wagmi/chains';
import { walletConnect, injected, coinbaseWallet } from 'wagmi/connectors';
import { AppProvider } from './contexts/AppContext';
import App from './App';
import './styles/app.css';
import './styles/lattice.css';
import './styles/landing.css';
import './styles/auth.css';

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || '';
const WC_PROJECT_ID = import.meta.env.VITE_WC_PROJECT_ID || '';

export const wagmiConfig = createConfig({
  chains: [mainnet, polygon, arbitrum, base],
  transports: {
    [mainnet.id]: http(), [polygon.id]: http(), [arbitrum.id]: http(), [base.id]: http(),
  },
  connectors: [
    injected(),
    ...(WC_PROJECT_ID ? [walletConnect({ projectId: WC_PROJECT_ID })] : []),
    coinbaseWallet({ appName: 'Provenode' }),
  ],
});

const queryClient = new QueryClient();

function Root() {
  if (!PRIVY_APP_ID) {
    return (
      <BrowserRouter>
        <AppProvider>
          <App noAuth />
        </AppProvider>
      </BrowserRouter>
    );
  }
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ['email', 'wallet', 'passkey'],
        appearance: { theme: 'light', accentColor: '#E85A28', logo: '/provenode-logo.svg' }
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <BrowserRouter>
            <AppProvider>
              <App />
            </AppProvider>
          </BrowserRouter>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><Root /></React.StrictMode>
);