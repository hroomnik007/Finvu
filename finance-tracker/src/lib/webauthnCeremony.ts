import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser'
import { apiUrl, getAccessToken, refreshAccessToken } from '../api/client'

// Safari before iOS/macOS 17.4 only shows the passkey sheet when
// navigator.credentials.create()/get() runs in direct response to a tap, and
// it carries that "user activation" across at most one native fetch(). axios
// (XMLHttpRequest) and a lazy import() before the ceremony both lose it, which
// surfaces as a NotAllowedError without any prompt. So every ceremony here
// (a) has @simplewebauthn/browser already loaded (static import by callers) and
// (b) does at most ONE native fetch between the tap and startRegistration /
// startAuthentication — or none, when the options were prefetched.

/** Error shaped like an axios error so existing `response.data.error` handling keeps working. */
export class ApiError extends Error {
  response: { status: number; data: { error?: string; code?: string } }
  constructor(status: number, data: { error?: string; code?: string }) {
    super(data?.error ?? `HTTP ${status}`)
    this.response = { status, data }
  }
}

const TOKEN_ERRORS = ['Invalid or expired access token', 'Missing or invalid authorization header']

async function nativeJson<T>(path: string, init: RequestInit = {}, authed = false): Promise<T> {
  const send = () => {
    const token = authed ? getAccessToken() : null
    return fetch(apiUrl(path), {
      ...init,
      credentials: 'include',
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
  }
  let res = await send()
  let data = await res.json().catch(() => ({}))
  // An expired access token: refresh once and retry. That second request costs
  // the user activation on old Safari, but it is rare (and modern Safari,
  // Chrome and Firefox don't care).
  if (authed && res.status === 401 && TOKEN_ERRORS.includes(data?.error)) {
    await refreshAccessToken()
    res = await send()
    data = await res.json().catch(() => ({}))
  }
  if (!res.ok) throw new ApiError(res.status, data)
  return data as T
}

export type LoginOptions = PublicKeyCredentialRequestOptionsJSON & { _challengeKey: string }

/** Usernameless login options (discoverable credentials, no e-mail sent). */
export function fetchLoginOptions(): Promise<LoginOptions> {
  return nativeJson<LoginOptions>('/api/auth/webauthn/authenticate-options')
}

export function fetchRegisterOptions(creds: { currentPassword?: string; currentPin?: string }): Promise<PublicKeyCredentialCreationOptionsJSON> {
  return nativeJson('/api/auth/webauthn/register-options', { method: 'POST', body: JSON.stringify(creds) }, true)
}

/** Challenge for confirming a sensitive action with one of the user's passkeys (2 minutes). */
export function fetchReauthOptions(): Promise<PublicKeyCredentialRequestOptionsJSON> {
  return nativeJson('/api/auth/webauthn/reauth-options', { method: 'POST' }, true)
}

// Server-side challenges live 5 minutes; a prefetched one is used for at most
// 4 so there is always time left to finish the ceremony.
export const PREFETCH_MAX_AGE_MS = 4 * 60 * 1000

export type CeremonyErrorKind = 'cancelled' | 'exists' | 'other'

/** NotAllowedError = user dismissed / timed out, AbortError = we aborted it, InvalidStateError on create = already registered. */
export function ceremonyErrorKind(err: unknown): CeremonyErrorKind {
  const name = (err as { name?: string })?.name
  const code = (err as { code?: string })?.code
  if (name === 'NotAllowedError' || name === 'AbortError' || code === 'ERROR_CEREMONY_ABORTED') return 'cancelled'
  if (name === 'InvalidStateError' || code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') return 'exists'
  return 'other'
}
