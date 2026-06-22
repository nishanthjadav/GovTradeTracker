import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import SignInGate from './components/SignInGate.jsx'
import AuthCallback from './components/AuthCallback.jsx'

const isAuthCallback = window.location.pathname === '/auth/callback';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      {isAuthCallback ? (
        <AuthCallback />
      ) : (
        <SignInGate>
          <App />
        </SignInGate>
      )}
    </AuthProvider>
  </StrictMode>,
)
