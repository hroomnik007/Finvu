// Machine-readable sign-in errors. The `error` text is plain English for logs
// and API clients; the app shows its own translation picked by `code`.
//
// Anti-enumeration: an unknown e-mail and a wrong password both answer
// INVALID_CREDENTIALS, and the per-IP limiter and the per-account lockout
// answer the same AUTH_RATE_LIMITED body, so neither reveals which accounts
// exist.
export const AUTH_ERRORS = {
  AUTH_RATE_LIMITED: "Too many attempts. Try again later.",
  INVALID_CREDENTIALS: "Invalid email or password.",
  INVALID_PIN: "Invalid PIN.",
  PASSKEY_FAILED: "Passkey sign-in failed.",
  EMAIL_NOT_VERIFIED: "Please verify your email before signing in.",
  ACCOUNT_DEACTIVATED: "This account is deactivated. Contact support to reactivate it.",
} as const;

export type AuthErrorCode = keyof typeof AUTH_ERRORS;

export function authError<C extends AuthErrorCode>(code: C): { error: (typeof AUTH_ERRORS)[C]; code: C } {
  return { error: AUTH_ERRORS[code], code };
}
