import axios, { AxiosError, type AxiosRequestConfig, type AxiosResponse } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Fake transport: each request is answered by `handler`, and we record what was sent.
type Sent = { method: string; url: string; csrf: string | undefined }
const sent: Sent[] = []
let handler: (method: string, url: string) => { status: number; data?: unknown } = () => ({ status: 200 })

axios.defaults.adapter = async (config: AxiosRequestConfig): Promise<AxiosResponse> => {
  const method = (config.method ?? 'get').toLowerCase()
  const url = config.url ?? ''
  const headers = config.headers as Record<string, string> | undefined
  sent.push({ method, url, csrf: headers?.['x-admin-csrf-token'] })
  const { status, data } = handler(method, url)
  const res = { data, status, statusText: '', headers: {}, config } as AxiosResponse
  if (status >= 400) throw new AxiosError('fail', String(status), config as never, null, res)
  return res
}

const TOKEN = 'a'.repeat(64)

async function load() {
  vi.resetModules()
  return import('./admin')
}

beforeEach(() => {
  sent.length = 0
  handler = (m, u) => {
    if (m === 'post' && u === '/api/auth/admin-login') return { status: 200, data: { success: true, csrfToken: TOKEN } }
    if (m === 'get' && u === '/api/admin/csrf') return { status: 200, data: { csrfToken: TOKEN } }
    return { status: 200, data: { success: true } }
  }
})

describe('admin CSRF token', () => {
  it('login stores the token in memory and logout sends it', async () => {
    const admin = await load()
    await admin.adminLogin('admin', 'pw')
    await admin.adminLogout()
    expect(sent.find(s => s.url === '/api/admin/logout')).toEqual({ method: 'post', url: '/api/admin/logout', csrf: TOKEN })
  })

  it('after a reload the session check fetches the token', async () => {
    const admin = await load()
    expect(await admin.checkAdminSession()).toBe(true)
    await admin.adminLogout()
    expect(sent.map(s => s.url)).toEqual(['/api/admin/csrf', '/api/admin/logout'])
    expect(sent[1].csrf).toBe(TOKEN)
  })

  it('logout without a token fetches one first', async () => {
    const admin = await load()
    await admin.adminLogout()
    expect(sent.map(s => s.url)).toEqual(['/api/admin/csrf', '/api/admin/logout'])
    expect(sent[1].csrf).toBe(TOKEN)
  })

  it('does not send the header on GET', async () => {
    const admin = await load()
    await admin.adminLogin('admin', 'pw')
    await admin.fetchAdminStats()
    expect(sent.find(s => s.url === '/api/admin/stats')?.csrf).toBeUndefined()
  })

  it('expired session: check fails, logout resolves and skips the POST', async () => {
    handler = () => ({ status: 401 })
    const admin = await load()
    expect(await admin.checkAdminSession()).toBe(false)
    await expect(admin.adminLogout()).resolves.toBeUndefined()
    expect(sent.some(s => s.url === '/api/admin/logout')).toBe(false)
  })

  it('a rejected logout still clears the token', async () => {
    const admin = await load()
    await admin.adminLogin('admin', 'pw')
    handler = (_m, u) => (u === '/api/admin/logout' ? { status: 403 } : { status: 401 })
    await expect(admin.adminLogout()).resolves.toBeUndefined()
    sent.length = 0
    await admin.adminLogout() // no token left: tries /csrf (401), no POST
    expect(sent.map(s => s.url)).toEqual(['/api/admin/csrf'])
  })

  it('clearAdminState drops the token', async () => {
    const admin = await load()
    await admin.adminLogin('admin', 'pw')
    admin.clearAdminState()
    handler = () => ({ status: 401 })
    sent.length = 0
    await admin.adminLogout()
    expect(sent.some(s => s.url === '/api/admin/logout')).toBe(false)
  })
})
