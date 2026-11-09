// Message to show for a failed API call. The server answers with an English
// `error` plus a machine-readable `code` (backend/src/lib/apiErrors.ts and
// authErrors.ts); the app shows its own translation picked by the code and
// never the server text, falling back to the caller's message otherwise.
import type { Translations } from '../i18n'
import { authErrorCode, authErrorMessage } from './authError'

export function apiErrorMessage(
  err: unknown,
  fallback: string,
  t: Pick<Translations, 'apiErrors' | 'auth'>,
): string {
  const code = authErrorCode(err)
  const text = code ? (t.apiErrors as Record<string, string>)[code] : undefined
  if (text) return text
  // Sign-in codes (rate limit, deactivated account, …) and a bare 429
  return authErrorMessage(err, fallback, t.auth)
}
