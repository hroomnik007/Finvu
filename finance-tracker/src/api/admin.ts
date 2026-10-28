import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

// The admin session lives entirely in an httpOnly cookie set by the backend
// (POST /api/auth/admin-login, scoped to /api/admin) — never in JS-readable
// storage, so it can't be exfiltrated via XSS, and it survives page reloads
// since the browser — not our JS — holds it.
const adminClient = axios.create({ baseURL: BASE_URL, withCredentials: true })

// Double-submit CSRF: the backend rejects any non-GET /api/admin request
// unless this header matches the httpOnly adminCsrf cookie. That cookie lives
// on the API host, so we can't read it; the token comes from the admin-login
// response or GET /api/admin/csrf and is kept in memory only.
let csrfToken: string | null = null

adminClient.interceptors.request.use((config) => {
  if (csrfToken && config.method && config.method.toLowerCase() !== 'get') {
    config.headers['x-admin-csrf-token'] = csrfToken
  }
  return config
})

export async function adminLogin(username: string, password: string): Promise<void> {
  const { data } = await adminClient.post<{ csrfToken: string }>('/api/auth/admin-login', { username, password })
  csrfToken = data.csrfToken
}

/** Resolves true if the admin cookie is valid; also loads the CSRF token. */
export async function checkAdminSession(): Promise<boolean> {
  try {
    const { data } = await adminClient.get<{ csrfToken: string }>('/api/admin/csrf')
    csrfToken = data.csrfToken
    return true
  } catch {
    csrfToken = null
    return false
  }
}

export async function adminLogout(): Promise<void> {
  try {
    if (!csrfToken) await checkAdminSession()
    if (csrfToken) await adminClient.post('/api/admin/logout')
  } catch {
    // session already gone or rejected — local state is cleared either way
  } finally {
    csrfToken = null
  }
}

/** Forget the in-memory admin state (e.g. after a 401/403). */
export function clearAdminState(): void {
  csrfToken = null
}

async function adminGet<T>(path: string): Promise<T> {
  const { data } = await adminClient.get<T>(path)
  return data
}

export interface AdminStats {
  totalUsers: number
  newUsers7d: number
  totalTransactions: number
  activeUsers30d: number
}

export interface AdminUser {
  id: string
  email: string
  name: string
  createdAt: string
  lastLoginAt: string | null
  lastActiveAt: string | null
  emailVerified: boolean
  transactionCount: number
}

export async function fetchAdminStats(): Promise<AdminStats> {
  return adminGet<AdminStats>('/api/admin/stats')
}

export async function fetchAdminUsers(): Promise<{ users: AdminUser[] }> {
  return adminGet<{ users: AdminUser[] }>('/api/admin/users')
}
