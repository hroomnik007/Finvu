import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { SettingsProvider, initialLanguage } from './context/SettingsContext'
import { loadLanguage } from './i18n'
import { AuthProvider } from './context/AuthContext'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { queryClient } from './lib/queryClient'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'placeholder-client-id'

// Fetch the user's language chunk first so the first paint is already translated.
void loadLanguage(initialLanguage()).then(() => createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SettingsProvider>
            <App />
          </SettingsProvider>
        </AuthProvider>
      </QueryClientProvider>
    </GoogleOAuthProvider>
  </StrictMode>,
))
