// Message to show for a failed sign-in. The account lockout is mapped to a
// translated text by its code; other errors keep the server's message.
export function authErrorMessage(err: unknown, fallback: string, tooManyAttempts: string): string {
  const data = (err as { response?: { data?: { error?: string; code?: string } } })?.response?.data
  if (data?.code === 'TOO_MANY_ATTEMPTS') return tooManyAttempts
  return data?.error ?? fallback
}

export function isTooManyAttempts(err: unknown): boolean {
  const res = (err as { response?: { status?: number } })?.response
  return res?.status === 429
}
