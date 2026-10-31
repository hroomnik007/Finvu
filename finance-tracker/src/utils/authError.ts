// Message to show for a failed sign-in. The server answers with an English
// `error` plus a machine-readable `code`; the app shows its own translation
// picked by the code and never the server text, falling back to a generic
// message for anything it doesn't recognise (network errors included).

export interface AuthErrorTexts {
  tooManyAttempts: string
  invalidCredentials: string
  wrongPin: string
  passkeyFailed: string
  notVerified: string
  accountDeactivated: string
}

const CODE_TO_KEY: Record<string, keyof AuthErrorTexts> = {
  AUTH_RATE_LIMITED: 'tooManyAttempts',
  TOO_MANY_ATTEMPTS: 'tooManyAttempts', // older servers' account lockout
  INVALID_CREDENTIALS: 'invalidCredentials',
  INVALID_PIN: 'wrongPin',
  PASSKEY_FAILED: 'passkeyFailed',
  EMAIL_NOT_VERIFIED: 'notVerified',
  ACCOUNT_DEACTIVATED: 'accountDeactivated',
}

export function authErrorCode(err: unknown): string | undefined {
  const code = (err as { response?: { data?: { code?: unknown } } })?.response?.data?.code
  return typeof code === 'string' ? code : undefined
}

export function isTooManyAttempts(err: unknown): boolean {
  const res = (err as { response?: { status?: number } })?.response
  return res?.status === 429
}

export function authErrorMessage(err: unknown, fallback: string, texts: AuthErrorTexts): string {
  const code = authErrorCode(err)
  const key = code ? CODE_TO_KEY[code] : undefined
  if (key) return texts[key]
  // A 429 from a proxy or an older limiter without a code
  if (isTooManyAttempts(err)) return texts.tooManyAttempts
  return fallback
}

// For non-sign-in auth forms (register, reset password) that otherwise show
// the server's own message: only the rate limit is coded there.
export function rateLimitedMessage(err: unknown, texts: Pick<AuthErrorTexts, 'tooManyAttempts'>): string | null {
  return authErrorCode(err) === 'AUTH_RATE_LIMITED' || isTooManyAttempts(err) ? texts.tooManyAttempts : null
}
