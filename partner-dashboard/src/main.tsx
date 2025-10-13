import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';
import * as serviceWorkerRegistration from './utils/serviceWorkerRegistration';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Register service worker for PWA functionality
serviceWorkerRegistration.register({
  onSuccess: () => console.log('[PWA] Content cached for offline use'),
  onUpdate: () => console.log('[PWA] New content available, please refresh'),
  onOfflineReady: () => console.log('[PWA] App ready to work offline'),
  onNeedRefresh: () => {
    // You can show a toast/notification here to inform user about update
    if (window.confirm('New version available! Click OK to refresh.')) {
      window.location.reload();
    }
  }
});