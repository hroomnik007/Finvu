// After MAX_FAILURES wrong attempts within WINDOW_MS an account is locked for LOCK_MS.
export const MAX_FAILURES = 5;
export const WINDOW_MS = 15 * 60 * 1000;
export const LOCK_MS = 15 * 60 * 1000;
