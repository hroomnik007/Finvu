import axios from 'axios'
import { shouldRefreshOn401 } from './refreshPolicy'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

/** Resolve a server-relative asset path (e.g. /uploads/avatars/…) to a full API URL. */
/** Full API URL for a server path, for the few calls that must use native fetch(). */
export function apiUrl(path: string): string {
  return `${BASE_URL}${path}`
}

export function resolveAssetUrl(pathOrUrl: string): string {
  return pathOrUrl.startsWith('/') ? `${BASE_URL}${pathOrUrl}` : pathOrUrl
}

let accessToken: string | null = null
let initializingAuth = true

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function getAccessToken(): string | null {
  return accessToken
}

export function setInitializingAuth(value: boolean) {
  initializingAuth = value
}

export const apiClient = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
})

apiClient.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

// Single in-flight refresh promise, shared by every caller — the reactive 401
// interceptor below AND any proactive caller (AuthContext.initAuth on boot,
// PullToRefresh triggering a burst of concurrent requests that can all 401 at
// once on an expired token). Whoever asks first starts the POST /api/auth/refresh;
// everyone else just awaits the same promise instead of firing their own request.
// This is what actually prevents the refresh-token rotation race (two concurrent
// refreshes, the loser's token already invalidated by the winner) that used to
// cascade into a full logout.
let refreshPromise: Promise<string> | null = null

export function refreshAccessToken(): Promise<string> {
  if (refreshPromise) return refreshPromise
  refreshPromise = axios
    .post(`${BASE_URL}/api/auth/refresh`, {}, { withCredentials: true })
    .then(({ data }) => {
      const newToken: string = data.accessToken
      setAccessToken(newToken)
      return newToken
    })
    .catch((err) => {
      setAccessToken(null)
      throw err
    })
    .finally(() => {
      refreshPromise = null
    })
  return refreshPromise
}

apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error)
    }
    // Never refresh on the refresh endpoint itself or on a sign-in endpoint,
    // whose 401 is a wrong-credentials answer the caller must see.
    if (!shouldRefreshOn401(originalRequest.url)) {
      return Promise.reject(error)
    }

    originalRequest._retry = true

    try {
      const newToken = await refreshAccessToken()
      originalRequest.headers.Authorization = `Bearer ${newToken}`
      return apiClient(originalRequest)
    } catch (refreshError) {
      if (!initializingAuth) {
        // If PIN lock is enabled, a failed background token refresh (e.g. after
        // returning from an auto-locked background tab) must not clear the
        // session — it should just re-show the PIN screen, not force a full
        // logout/relogin (which was also hammering the login rate limiter).
        const hasPinLock = localStorage.getItem('lock_method') === 'pin'
        window.dispatchEvent(new Event(hasPinLock ? 'auth:pin-lock-required' : 'auth:logout'))
      }
      return Promise.reject(refreshError)
    }
  }
)
