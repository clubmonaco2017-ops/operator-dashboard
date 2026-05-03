import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './useAuth.jsx'
import { AgencyProvider } from './lib/agencyContext.jsx'
import { ensureSWRegistered } from './lib/pushClient.js'

if (typeof window !== 'undefined') {
  ensureSWRegistered().catch(() => { /* SW unsupported or blocked */ })

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      const { type, url } = event.data || {}
      if (type === 'push:navigate' && typeof url === 'string') {
        window.history.pushState({}, '', url)
        window.dispatchEvent(new PopStateEvent('popstate'))
      }
    })
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AgencyProvider>
          <App />
        </AgencyProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
