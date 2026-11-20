import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './index.css';
import { App } from './app/App';
// Registered early so Chrome's one-time install event is never missed.
import './features/install/InstallCard';
import { applyTheme, readStoredTheme } from './lib/theme';

applyTheme(readStoredTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
