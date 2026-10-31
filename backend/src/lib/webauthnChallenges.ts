// WebAuthn relying-party settings and the short-lived challenge store, shared
// by the passkey controller and the re-auth check (lib/passkeyReauth).
//
// Kept in memory on purpose (single backend container): moving it to Postgres
// would turn every anonymous GET authenticate-options into a database write.
import { env } from "../config/env";

export const RP_ID = env.WEBAUTHN_RP_ID ?? new URL(env.APP_URL).hostname;
export const ORIGIN = env.WEBAUTHN_ORIGIN ?? new URL(env.APP_URL).origin;

// Unauthenticated login-challenge issuance (GET authenticate-options)
// means this store must defend itself: bounded size (oldest-inserted entries
// evicted first once full) plus a periodic sweep that reclaims expired
// entries even if the caller never comes back to consume them — a plain
// unbounded Map here was a trivial unauthenticated memory-exhaustion DoS
// (security audit run-1).
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_CHALLENGES = 10_000;

const challengeStore = new Map<string, { challenge: string; expiresAt: number }>();

export function storeChallenge(key: string, challenge: string, ttlMs = CHALLENGE_TTL_MS) {
  if (!challengeStore.has(key) && challengeStore.size >= MAX_CHALLENGES) {
    const oldestKey = challengeStore.keys().next().value;
    if (oldestKey !== undefined) challengeStore.delete(oldestKey);
  }
  challengeStore.set(key, { challenge, expiresAt: Date.now() + Math.min(ttlMs, CHALLENGE_TTL_MS) });
}

export function consumeChallenge(key: string): string | null {
  const entry = challengeStore.get(key);
  challengeStore.delete(key);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry.challenge;
}

const sweepInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of challengeStore) {
    if (entry.expiresAt < now) challengeStore.delete(key);
  }
}, 60 * 1000);
sweepInterval.unref();
