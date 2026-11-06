import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './ErrorBoundary'
import { installGlobalErrorHandlers } from './errors'

installGlobalErrorHandlers()

// Permite instalar la app en el celular y recibir avisos push.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}

async function start() {
  // Versión demo: un Traccar simulado dentro del navegador, con datos de prueba.
  if (import.meta.env.VITE_DEMO === '1') (await import('./demo/fakeServer')).install()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary where="app" full>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
}
start()
