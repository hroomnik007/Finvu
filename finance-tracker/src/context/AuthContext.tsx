import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react'
import { setAccessToken, setInitializingAuth } from '../api/client'
import { resolveTheme, type ThemePreference } from '../utils/theme'
import {
  login as apiLogin,
  register as apiRegister,
  logout as apiLogout,
  refreshToken,
  getMe,
  deleteAccount as apiDeleteAccount,
  demoLogin as apiDemoLogin,
  googleLogin as apiGoogleLogin,
  updateUserSettings,
  pinLogin as apiPinLogin,
} from '../api/auth'
import { applyLanguageSetting } from './SettingsContext'
import type { AuthUser } from '../types'
import type { DeleteAccountProof } from '../api/auth'
import { clearUserData, noteSignedInUser } from '../lib/userDataReset'

interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  isGuest: boolean
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>
  loginDemo: () => Promise<void>
  loginWithGoogle: (accessToken: string) => Promise<void>
  loginWithPin: (email: string, pin: string) => Promise<void>
  loginWithToken: (user: AuthUser, accessToken: string, sessionId?: string) => void
  register: (email: string, password: string, name: string, gdprConsent: boolean) => Promise<void>
  loginAsGuest: () => void
  logout: () => Promise<void>
  deleteAccount: (proof: DeleteAccountProof) => Promise<void>
  refreshUser: () => Promise<void>
  completeOnboarding: () => Promise<void>
  updateMonthlyEmail: (enabled: boolean) => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  isGuest: false,
  login: async () => {},
  loginDemo: async () => {},
  loginWithGoogle: async () => {},
  loginWithPin: async () => {},
  loginWithToken: () => {},
  register: async () => {},
  loginAsGuest: () => {},
  logout: async () => {},
  deleteAccount: async () => {},
  refreshUser: async () => {},
  completeOnboarding: async () => {},
  updateMonthlyEmail: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isGuest, setIsGuest] = useState(false)

  const doLogout = useCallback(async (callApi = true) => {
    try {
      if (callApi && !isGuest) await apiLogout()
    } catch { /* ignore */ }
    setAccessToken(null)
    setUser(null)
    setIsGuest(false)
    try {
      sessionStorage.removeItem('auth_guest')
    } catch { /* ignore */ }
    clearUserData()
  }, [isGuest])

  useEffect(() => {
    const guestFlag =
      sessionStorage.getItem('auth_guest') === 'true' ||
      localStorage.getItem('auth_guest') === 'true'

    if (guestFlag) {
      setIsGuest(true)
      setInitializingAuth(false)
      setIsLoading(false)
      return
    }

    const initAuth = async () => {
      try {
        let accessToken: string
        try {
          ;({ accessToken } = await refreshToken())
        } catch {
          // A pull-to-refresh reload can land while the previous page load's
          // refresh-token rotation is still in flight, so this request loses
          // the race and 401s even though a valid rotated cookie is about to
          // land. One short retry gives that in-flight rotation time to
          // finish before treating it as a real logged-out session.
          await new Promise((resolve) => setTimeout(resolve, 500))
          ;({ accessToken } = await refreshToken())
        }
        setAccessToken(accessToken)
        const { user: me } = await getMe()
        noteSignedInUser(me.id)
        setUser(me)
        if (me.theme) {
          try {
            localStorage.setItem('theme_preference', me.theme)
            document.documentElement.setAttribute('data-theme', resolveTheme(me.theme as ThemePreference))
          } catch { /* ignore */ }
        }
        if (me.language) applyLanguageSetting(me.language)
      } catch {
        setUser(null)
      } finally {
        setInitializingAuth(false)
        setIsLoading(false)
      }
    }

    initAuth()
  }, [])

  useEffect(() => {
    const handler = () => doLogout(false)
    window.addEventListener('auth:logout', handler)
    return () => window.removeEventListener('auth:logout', handler)
  }, [doLogout])

  const login = useCallback(async (email: string, password: string, rememberMe = false) => {
    const { user: me, accessToken, sessionId } = await apiLogin(email, password) as { user: AuthUser; accessToken: string; sessionId?: string }
    setAccessToken(accessToken)
    noteSignedInUser(me.id)
    setUser(me)
    setIsGuest(false)
    try {
      if (rememberMe) localStorage.setItem('auth_remember', 'true')
      sessionStorage.removeItem('auth_guest')
      localStorage.removeItem('auth_guest')
      sessionStorage.setItem('just_logged_in', 'true')
      // A full authentication just happened in this tab — PIN quick-unlock isn't needed.
      sessionStorage.setItem('pin_verified_session', 'true')
      if (sessionId) localStorage.setItem('finvu_session_id', sessionId)
      if (me.theme) {
        localStorage.setItem('theme_preference', me.theme)
        document.documentElement.setAttribute('data-theme', resolveTheme(me.theme as ThemePreference))
      }
      if (me.language) applyLanguageSetting(me.language)
    } catch { /* ignore */ }
  }, [])

  const loginDemo = useCallback(async () => {
    const { user: me, accessToken, sessionId } = await apiDemoLogin() as { user: AuthUser; accessToken: string; sessionId?: string }
    setAccessToken(accessToken)
    noteSignedInUser(me.id)
    setUser({ ...me, onboardingComplete: false, isDemo: true })
    setIsGuest(false)
    try {
      sessionStorage.removeItem('auth_guest')
      localStorage.removeItem('auth_guest')
      sessionStorage.setItem('just_logged_in', 'true')
      // A full authentication just happened in this tab — PIN quick-unlock isn't needed.
      sessionStorage.setItem('pin_verified_session', 'true')
      if (sessionId) localStorage.setItem('finvu_session_id', sessionId)
    } catch { /* ignore */ }
  }, [])

  const loginWithGoogle = useCallback(async (googleAccessToken: string) => {
    const { user: me, accessToken, sessionId } = await apiGoogleLogin(googleAccessToken) as { user: AuthUser; accessToken: string; sessionId?: string }
    setAccessToken(accessToken)
    noteSignedInUser(me.id)
    setUser(me)
    setIsGuest(false)
    try {
      sessionStorage.removeItem('auth_guest')
      localStorage.removeItem('auth_guest')
      sessionStorage.setItem('just_logged_in', 'true')
      // A full authentication just happened in this tab — PIN quick-unlock isn't needed.
      sessionStorage.setItem('pin_verified_session', 'true')
      if (sessionId) localStorage.setItem('finvu_session_id', sessionId)
      if (me.language) applyLanguageSetting(me.language)
    } catch { /* ignore */ }
  }, [])

  const loginWithPin = useCallback(async (email: string, pin: string) => {
    const { user: me, accessToken, sessionId } = await apiPinLogin(email, pin) as { user: AuthUser; accessToken: string; sessionId?: string }
    setAccessToken(accessToken)
    noteSignedInUser(me.id)
    setUser(me)
    setIsGuest(false)
    try {
      sessionStorage.removeItem('auth_guest')
      localStorage.removeItem('auth_guest')
      sessionStorage.setItem('just_logged_in', 'true')
      // PIN was just used to authenticate — mark session verified so PinLock doesn't show again
      sessionStorage.setItem('pin_verified_session', 'true')
      if (sessionId) localStorage.setItem('finvu_session_id', sessionId)
      if (me.language) applyLanguageSetting(me.language)
    } catch { /* ignore */ }
  }, [])

  const loginWithToken = useCallback((me: AuthUser, accessToken: string, sessionId?: string) => {
    setAccessToken(accessToken)
    noteSignedInUser(me.id)
    setUser(me)
    setIsGuest(false)
    try {
      sessionStorage.removeItem('auth_guest')
      localStorage.removeItem('auth_guest')
      sessionStorage.setItem('just_logged_in', 'true')
      // A full authentication just happened in this tab — PIN quick-unlock isn't needed.
      sessionStorage.setItem('pin_verified_session', 'true')
      if (sessionId) localStorage.setItem('finvu_session_id', sessionId)
      if (me.language) applyLanguageSetting(me.language)
    } catch { /* ignore */ }
  }, [])

  const refreshUser = useCallback(async () => {
    try {
      const { user: me } = await getMe()
      noteSignedInUser(me.id)
      setUser(me)
    } catch { /* ignore */ }
  }, [])

  const register = useCallback(async (email: string, password: string, name: string, gdprConsent: boolean) => {
    // Registration now sends verification email; user is NOT logged in yet
    await apiRegister(email, password, name, gdprConsent)
  }, [])

  const loginAsGuest = useCallback(() => {
    clearUserData()
    setIsGuest(true)
    setUser(null)
    try { sessionStorage.setItem('auth_guest', 'true') } catch { /* ignore */ }
  }, [])

  const logout = useCallback(() => doLogout(true), [doLogout])

  const deleteAccount = useCallback(async (proof: DeleteAccountProof) => {
    await apiDeleteAccount(proof)
    await doLogout(false)
  }, [doLogout])

  const completeOnboarding = useCallback(async () => {
    await updateUserSettings({ onboardingComplete: true })
    setUser(prev => prev ? { ...prev, onboardingComplete: true } : prev)
  }, [])

  const updateMonthlyEmail = useCallback(async (enabled: boolean) => {
    await updateUserSettings({ monthlyEmailEnabled: enabled })
    setUser(prev => prev ? { ...prev, monthlyEmailEnabled: enabled } : prev)
  }, [])

  const contextValue = useMemo(() => ({
    user,
    isAuthenticated: !!user || isGuest,
    isLoading,
    isGuest,
    login,
    loginDemo,
    loginWithGoogle,
    loginWithPin,
    loginWithToken,
    register,
    loginAsGuest,
    logout,
    deleteAccount,
    refreshUser,
    completeOnboarding,
    updateMonthlyEmail,
  }), [user, isLoading, isGuest, login, loginDemo, loginWithGoogle, loginWithPin, loginWithToken, register, loginAsGuest, logout, deleteAccount, refreshUser, completeOnboarding, updateMonthlyEmail])

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
