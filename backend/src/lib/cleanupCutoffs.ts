const DAY_MS = 24 * 60 * 60 * 1000;

// How long expired or finished rows are kept before the nightly cleanup removes them.
// The grace periods leave time to investigate a login problem after the fact.
export function cleanupCutoffs(now: Date): { tokens: Date; revokedTokens: Date; sessions: Date } {
  return {
    tokens: new Date(now.getTime() - DAY_MS),
    revokedTokens: new Date(now.getTime() - 7 * DAY_MS),
    sessions: new Date(now.getTime() - 90 * DAY_MS),
  };
}
