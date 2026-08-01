import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/theme.css'
import './styles/components.css'
import './index.css'
import './styles/print.css';
import App from './App.jsx'
import { installCsrfFetch } from './api/csrf.js'
import { installSessionExpiryFetch } from './api/sessionExpiry.js'

// Make every API mutation carry the CSRF header, before the first request fires,
// then layer the session-expiry watch on top so it sees the final response.
installCsrfFetch()
installSessionExpiryFetch()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
