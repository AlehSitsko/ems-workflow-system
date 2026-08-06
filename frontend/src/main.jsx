import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Bootstrap + icons are bundled locally (not from a CDN) so the desktop build is
// fully styled offline and complies with its strict same-origin CSP. Imported
// first, so the app's own tokens/theme below can override Bootstrap.
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap-icons/font/bootstrap-icons.css'
import './styles/tokens.css'
import './styles/theme.css'
import './styles/components.css'
import './index.css'
import './styles/print.css';
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { installCsrfFetch } from './api/csrf.js'
import { installSessionExpiryFetch } from './api/sessionExpiry.js'

// Make every API mutation carry the CSRF header, before the first request fires,
// then layer the session-expiry watch on top so it sees the final response.
installCsrfFetch()
installSessionExpiryFetch()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
