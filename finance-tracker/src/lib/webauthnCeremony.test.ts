import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setAccessToken } from '../api/client'
import { ApiError, ceremonyErrorKind, fetchLoginOptions, fetchRegisterOptions } from './webauthnCeremony'

type Call = { url: string; init: RequestInit }
let calls: Call[] = []
let answers: { status: number; body: unknown }[] = []

beforeEach(() => {
  calls = []
  answers = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const a = answers.shift() ?? { status: 200, body: {} }
    return { ok: a.status < 400, status: a.status, json: async () => a.body } as Response
  }))
  // The token refresh goes through axios — answer it with a new access token.
  axios.defaults.adapter = async (config: AxiosRequestConfig): Promise<AxiosResponse> =>
    ({ data: { accessToken: 'fresh-token' }, status: 200, statusText: '', headers: {}, config } as AxiosResponse)
  setAccessToken('old-token')
})
afterEach(() => { vi.unstubAllGlobals() })

const auth = (c: Call) => (c.init.headers as Record<string, string>).Authorization

describe('webauthn ceremony fetches', () => {
  it('login options: one native GET, no credentials header, no e-mail', async () => {
    answers = [{ status: 200, body: { challenge: 'c', _challengeKey: 'k' } }]
    const o = await fetchLoginOptions()
    expect(o._challengeKey).toBe('k')
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toMatch(/\/api\/auth\/webauthn\/authenticate-options$/)
    expect(auth(calls[0])).toBeUndefined()
  })

  it('register options: a single POST with the bearer token and the secret', async () => {
    answers = [{ status: 200, body: { challenge: 'c' } }]
    await fetchRegisterOptions({ currentPassword: 'pw' })
    expect(calls).toHaveLength(1)
    expect(calls[0].init.method).toBe('POST')
    expect(auth(calls[0])).toBe('Bearer old-token')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ currentPassword: 'pw' })
  })

  it('refreshes an expired access token once and retries', async () => {
    answers = [{ status: 401, body: { error: 'Invalid or expired access token' } }, { status: 200, body: { challenge: 'c' } }]
    await fetchRegisterOptions({})
    expect(calls).toHaveLength(2)
    expect(auth(calls[1])).toBe('Bearer fresh-token')
  })

  it('a wrong password is not mistaken for an expired token', async () => {
    answers = [{ status: 401, body: { error: 'Nesprávne overenie totožnosti.' } }]
    const err = await fetchRegisterOptions({ currentPassword: 'bad' }).catch(e => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.response).toEqual({ status: 401, data: { error: 'Nesprávne overenie totožnosti.' } })
    expect(calls).toHaveLength(1)
  })
})

describe('ceremonyErrorKind', () => {
  it('classifies cancel / abort / already registered', () => {
    expect(ceremonyErrorKind({ name: 'NotAllowedError' })).toBe('cancelled')
    expect(ceremonyErrorKind({ name: 'AbortError' })).toBe('cancelled')
    expect(ceremonyErrorKind({ code: 'ERROR_CEREMONY_ABORTED' })).toBe('cancelled')
    expect(ceremonyErrorKind({ name: 'InvalidStateError' })).toBe('exists')
    expect(ceremonyErrorKind(new Error('x'))).toBe('other')
  })
})
