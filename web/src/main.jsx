import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { RoomProvider } from './state.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RoomProvider>
      <App />
    </RoomProvider>
  </StrictMode>,
);
