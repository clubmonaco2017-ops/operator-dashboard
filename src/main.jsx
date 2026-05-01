import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './useAuth.jsx'
import { AgencyProvider } from './lib/agencyContext.jsx'

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
