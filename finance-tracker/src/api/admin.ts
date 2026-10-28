import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

// The admin session lives entirely in an httpOnly cookie set by the backend
// (POST /api/auth/admin-login, scoped to /api/admin) — never in JS-readable
// storage, so it can't be exfiltrated via XSS, and it survives page reloads
// since the browser — not our JS — holds it.
const adminClient = axios.create({ baseURL: BASE_URL, withCredentials: true })

// Double-submit CSRF: the backend rejects any non-GET /api/admin request
// unless this header echoes the (non-httpOnly) CSRF cookie, which a
// cross-site attacker can't read to forge.
function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

adminClient.interceptors.request.use((config) => {
  if (config.method && config.method.toLowerCase() !== 'get') {
    const csrfToken = readCookie('adminCsrf')
    if (csrfToken) {
      config.headers['x-admin-csrf-token'] = csrfToken
    }
  }
  return config
})

/** Resolves true if the admin cookie is present and still valid. */
export async function checkAdminSession(): Promise<boolean> {
  try {
    await adminClient.get('/api/admin/session')
    return true
  } catch {
    return false
  }
}

export async function adminLogout(): Promise<void> {
  await adminClient.post('/api/admin/logout').catch(() => {})
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
