import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Atrapa y amortigua errores internos de assertions del SDK de Firestore
// (como cuota agotada o cortes abruptos del watch stream gRPC)
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    const msg = event?.message || '';
    if (typeof msg === 'string' && (msg.includes('FIRESTORE') || msg.includes('INTERNAL ASSERTION FAILED'))) {
      event.preventDefault();
      console.warn('[Firebase] Aviso interno del SDK amortiguado (cuota agotada o reconexión de stream). La app continúa funcionando con Capa 1 y Capa 2.');
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = String(event?.reason?.message || event?.reason || '');
    if (reason.includes('FIRESTORE') || reason.includes('INTERNAL ASSERTION FAILED') || reason.includes('resource-exhausted')) {
      event.preventDefault();
      console.warn('[Firebase] Rechazo de stream interno del SDK amortiguado.');
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
