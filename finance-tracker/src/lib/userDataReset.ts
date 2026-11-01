import { queryClient } from './queryClient'
import { clearOfflineQueue } from './offlineQueue'
import { clearPersistedQueries } from './queryPersist'
import { kvDel } from './kvStore'

/** Last signed-in user, so a start without a connection can open cached data. */
export const OFFLINE_USER_KEY = 'offline_user'

// Per-user data kept on the device. Device prefs (theme, language, layout,
// lock_method) stay; anything tied to the signed-in person goes on logout.
const USER_KEYS = [
  'auth_remember',
  'budget_template_dismissed',
  'category_budget_limits',
  'fixed_expense_notified',
  'finvu_read_notifications',
  'finvu_session_id',
  'profile_name',
  'profile_avatar',
]
// Old builds wrote these with the user's email in the key name.
// finvu_first_run_dismissed_<userId>: the first-run checklist was closed.
const USER_KEY_PREFIXES = ['pin_enabled_', 'webauthn_enabled_', 'finvu_first_run_dismissed_']

export const USER_DATA_CLEARED_EVENT = 'auth:user-data-cleared'

let lastUserId: string | null = null

export function clearUserData() {
  queryClient.clear()
  lastUserId = null
  // Offline copies: unsent creates, the cached query data and the cached user.
  void clearOfflineQueue()
  void clearPersistedQueries()
  void kvDel(OFFLINE_USER_KEY)
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
