// A 401 from these endpoints means "wrong credentials", not "access token
// expired": refreshing (and retrying) there would replace the real error with
// the refresh failure and, with no session, fire a logout.
const NO_REFRESH = [
  '/api/auth/refresh',
  '/api/auth/login',
  '/api/auth/pin-login',
  '/api/auth/admin-login',
  '/api/auth/google',
  '/api/auth/webauthn/authenticate-verify',
]

export function shouldRefreshOn401(url: string | undefined): boolean {
  if (!url) return true
  const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0]
  return !NO_REFRESH.includes(path)
}
