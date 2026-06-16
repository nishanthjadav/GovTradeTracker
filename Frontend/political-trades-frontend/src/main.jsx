import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import SignInGate from './components/SignInGate.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <SignInGate>
        <App />
      </SignInGate>
    </AuthProvider>
  </StrictMode>,
)
