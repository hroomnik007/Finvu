import { queryClient } from './queryClient'

// Per-user data kept on the device. Device prefs (theme, language, layout,
// lock_method) stay; anything tied to the signed-in person goes on logout.
const USER_KEYS = [
  'auth_remember',
  'category_budget_limits',
  'fixed_expense_notified',
  'finvu_read_notifications',
  'finvu_session_id',
  'profile_name',
  'profile_avatar',
]
// Old builds wrote these with the user's email in the key name.
const USER_KEY_PREFIXES = ['pin_enabled_', 'webauthn_enabled_']

export const USER_DATA_CLEARED_EVENT = 'auth:user-data-cleared'

let lastUserId: string | null = null

export function clearUserData() {
  queryClient.clear()
  lastUserId = null
  try {
    for (const key of USER_KEYS) localStorage.removeItem(key)
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key && USER_KEY_PREFIXES.some(p => key.startsWith(p))) localStorage.removeItem(key)
    }
  } catch { /* ignore */ }
  try { window.dispatchEvent(new Event(USER_DATA_CLEARED_EVENT)) } catch { /* ignore */ }
}

// Call before setUser() with a user from the server. Drops cached queries
// when the account differs from the one the cache was filled for.
export function noteSignedInUser(userId: string) {
  if (lastUserId !== userId) queryClient.clear()
  lastUserId = userId
}
