import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import SignInGate from './components/SignInGate.jsx'
import AuthCallback from './components/AuthCallback.jsx'
import NotFound from './components/NotFound.jsx'

const path = window.location.pathname;
const isAuthCallback = path === '/auth/callback';
const isKnownPath = path === '/' || path === '/auth/callback';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {!isKnownPath && !isAuthCallback ? (
      <NotFound />
    ) : (
      <AuthProvider>
        {isAuthCallback ? (
          <AuthCallback />
        ) : (
          <SignInGate>
            <App />
          </SignInGate>
        )}
      </AuthProvider>
    )}
  </StrictMode>,
)
