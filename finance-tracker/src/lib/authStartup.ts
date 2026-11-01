import type { AuthUser } from '../types'
import { isOfflineError } from './offlineQueue'

/**
 * What to do when the sign-in check at app start fails.
 *  - No answer from the server at all (offline): hand back the cached user, if
 *    any, so the app opens with its cached data. Nothing is cleared.
 *  - The server answered 401 (refresh cookie expired, session revoked): the
 *    session is over, so the cached copies of that account are wiped like on
 *    logout — otherwise a later offline start would bring them back.
 *  - Any other failure (5xx, 429, ...): not proof that the session ended, so
 *    nothing is cleared.
 */
export async function resolveStartupFailure(
  err: unknown,
  deps: { readCachedUser: () => Promise<unknown>; clearUserData: () => void },
): Promise<AuthUser | null> {
  if (isOfflineError(err)) {
    const cached = await deps.readCachedUser().catch(() => undefined)
    if (cached && typeof cached === 'object' && typeof (cached as AuthUser).id === 'string') return cached as AuthUser
    return null
  }
  const status = (err as { response?: { status?: number } } | null)?.response?.status
  if (status === 401) deps.clearUserData()
  return null
}
