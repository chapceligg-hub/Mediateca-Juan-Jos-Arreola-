import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Silenciar errores internos conocidos de aserción del SDK de Firestore (ej. ID: b815, ID: ca9)
if (typeof window !== 'undefined') {
  const isFirestoreAssertionError = (msg: any) => {
    if (!msg) return false;
    const str = typeof msg === 'string' ? msg : (msg?.message || String(msg));
    return (
      str.includes('INTERNAL ASSERTION FAILED') ||
      str.includes('Unexpected state (ID:') ||
      str.includes('ve":-1')
    );
  };

  window.addEventListener('error', (event) => {
    if (isFirestoreAssertionError(event?.error) || isFirestoreAssertionError(event?.message)) {
      event.preventDefault();
      event.stopPropagation();
      console.warn('[Firestore] Error interno de aserción interceptado y neutralizado:', event.error?.message || event.message);
      return true;
    }
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    if (isFirestoreAssertionError(event?.reason)) {
      event.preventDefault();
      event.stopPropagation();
      console.warn('[Firestore] Rechazo asíncrono de aserción interceptado y neutralizado:', event.reason?.message || event.reason);
      return true;
    }
  }, true);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
