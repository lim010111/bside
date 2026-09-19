import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { DiscoveryProvider } from './state.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <DiscoveryProvider>
      <App />
    </DiscoveryProvider>
  </StrictMode>,
);
