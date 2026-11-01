import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { savePin, deletePin, pinLogin, sessionCheck, pingSession } from '../api/auth'

const LOCK_METHOD_KEY = 'lock_method'
const PIN_SESSION_KEY = 'pin_verified_session'

export function usePinLock() {
  const { user, refreshUser } = useAuth()
  const [lockMethod, setLockMethod] = useState<'pin' | null>(
    () => {
      const v = localStorage.getItem(LOCK_METHOD_KEY)
      return v === 'pin' ? 'pin' : null
    }
  )
  // Start locked if PIN is set AND this browser session hasn't verified yet.
  // sessionStorage persists across hard refresh but clears on tab close / logout.
  // Note: auto_lock_minutes isn't known synchronously here (user loads async on
  // cold PWA open) — the "Nikdy" case is reconciled once `user` loads, below.
  const [locked, setLocked] = useState(() => {
    const v = localStorage.getItem(LOCK_METHOD_KEY)
    if (v !== 'pin') return false
    return sessionStorage.getItem(PIN_SESSION_KEY) !== 'true'
  })
  const lockMethodRef = useRef(lockMethod)
  lockMethodRef.current = lockMethod

  const hasPin = lockMethod === 'pin'
  const lockedRef = useRef(locked)
  lockedRef.current = locked

  const autoLockMs = user?.auto_lock_minutes != null ? user.auto_lock_minutes * 60 * 1000 : null

  // Always clear the session flag when locking so hard-refresh also shows PIN.
  const lockAndClearSession = useCallback(() => {
    sessionStorage.removeItem(PIN_SESSION_KEY)
    setLocked(true)
  }, [])

  // The axios interceptor dispatches this when a background silent token
  // refresh fails while PIN lock is enabled — show the PIN screen instead of
  // logging the user out (see client.ts).
  useEffect(() => {
    const handler = () => lockAndClearSession()
    window.addEventListener('auth:pin-lock-required', handler)
    return () => window.removeEventListener('auth:pin-lock-required', handler)
  }, [lockAndClearSession])

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== LOCK_METHOD_KEY) return
      const next = e.newValue === 'pin' ? 'pin' : null
      setLockMethod(next)
      if (!next) setLocked(false)
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  // Mount-once check — runs before AuthContext sets user (mobile PWA cold open)
  useEffect(() => {
    if (!lockMethodRef.current) return
    async function check() {
      if (lockedRef.current) return
      try {
        const result = await sessionCheck()
        if (!result.valid && result.reason === 'timeout') {
          lockAndClearSession()
        }
      } catch { /* network errors must not lock user out */ }
    }
    check()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Unified visibilitychange handler: auto-lock (time-based + Ihneď) + server session check + ping
  useEffect(() => {
    if (!lockMethod || !user) return

    async function checkSession() {
      if (lockedRef.current) return
      try {
        const result = await sessionCheck()
        if (!result.valid && result.reason === 'timeout') {
          lockAndClearSession()
        }
      } catch { /* network errors must not lock user out */ }
    }

    let hiddenAt: number | null = null

    const handler = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
      } else if (document.visibilityState === 'visible') {
        if (hiddenAt === null) return
        const hiddenMs = Date.now() - hiddenAt
        hiddenAt = null
        if (autoLockMs !== null && hiddenMs > autoLockMs) {
          lockAndClearSession()
          return
        }
        if (hiddenMs > 4 * 60 * 1000) checkSession()
      }
    }
    document.addEventListener('visibilitychange', handler)

    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') pingSession().catch(() => {})
    }, 60_000)

    return () => {
      document.removeEventListener('visibilitychange', handler)
      clearInterval(intervalId)
    }
  }, [lockMethod, user, lockAndClearSession, autoLockMs])

  // Sync lockMethod with server on user load — resolves cross-device desync
  useEffect(() => {
    if (!user) return

    // User just authenticated (e.g. PIN login from Login page).
    // If the session flag is already set but locked state is still true
    // (set at mount before login completed), unlock now so PinLock never shows.
    if (sessionStorage.getItem(PIN_SESSION_KEY) === 'true' && lockedRef.current) {
      setLocked(false)
    }

    // "Nikdy" (auto_lock_minutes === null): never require PIN, not even on cold open.
    if (user.auto_lock_minutes == null && lockedRef.current) {
      setLocked(false)
    }

    const serverHasPin = !!user.has_pin
    const current = lockMethodRef.current
    if (!serverHasPin && current === 'pin') {
      localStorage.removeItem(LOCK_METHOD_KEY)
      setLockMethod(null)
      setLocked(false)
    } else if (serverHasPin && current === null) {
      localStorage.setItem(LOCK_METHOD_KEY, 'pin')
      setLockMethod('pin')
    }
   
  }, [user])

  // Clear session verification on logout so re-login requires PIN again
  const prevUserRef = useRef(user)
  useEffect(() => {
    const prev = prevUserRef.current
    prevUserRef.current = user
    if (prev !== null && user === null) {
      sessionStorage.removeItem(PIN_SESSION_KEY)
      // Reset locked state so next login via password/Google triggers PinLock
      if (lockMethodRef.current === 'pin') setLocked(true)
    }
  }, [user])

  const setupPin = useCallback(async (pin: string, currentPassword?: string, currentPin?: string, googleAccessToken?: string) => {
    await savePin(pin, currentPassword, currentPin, googleAccessToken)
    localStorage.setItem(LOCK_METHOD_KEY, 'pin')
    sessionStorage.setItem(PIN_SESSION_KEY, 'true')
    setLockMethod('pin')
    setLocked(false)
  }, [])

  const verifyPin = useCallback(async (pin: string): Promise<boolean> => {
    if (!user?.email) return false
    try {
      await pinLogin(user.email, pin)
      sessionStorage.setItem(PIN_SESSION_KEY, 'true')
      setLocked(false)
      return true
    } catch {
      return false
    }
  }, [user])

  const removePin = useCallback(async (currentPassword?: string, currentPin?: string) => {
    await deletePin(currentPassword, currentPin)
    localStorage.removeItem(LOCK_METHOD_KEY)
    sessionStorage.removeItem(PIN_SESSION_KEY)
    setLockMethod(null)
    setLocked(false)
    refreshUser()
  }, [refreshUser])

  return {
    hasPin, lockMethod, locked,
    setupPin, verifyPin, removePin,
  }
}
