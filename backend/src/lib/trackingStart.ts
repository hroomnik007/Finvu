import { localDateISO } from "./localDate";

// Each user's first tracked month (YYYY-MM): the month of users.tracking_start_date,
// or — when it was never set — the month the account was created. Every monthly
// aggregate treats the months before it as empty for that user, one-off and
// recurring rows alike; a recurring row dated earlier still counts from this month
// on. The frontend applies the same rule (utils/trackingStart.ts).
export type StartMonths = ReadonlyMap<string, string>;

export function startMonthOf(trackingStartDate: string | null | undefined, createdAt: Date | string | null | undefined): string | null {
  if (trackingStartDate) return trackingStartDate.slice(0, 7);
  if (createdAt) {
    const d = createdAt instanceof Date ? createdAt : new Date(createdAt);
    if (!Number.isNaN(d.getTime())) return localDateISO(d).slice(0, 7);
  }
  return null;
}

// Whether `userId`'s rows count in month `ym` (YYYY-MM). Unknown users and a
// missing map count everywhere, so callers that pass no starts keep the old result.
export function isTrackedMonth(starts: StartMonths | undefined, userId: string | undefined, ym: string): boolean {
  if (!starts || userId === undefined) return true;
  const start = starts.get(userId);
  return !start || ym >= start;
}

// Earliest start among the given users (YYYY-MM), or null when none is known.
export function earliestStart(starts: StartMonths, ids: readonly string[]): string | null {
  let min: string | null = null;
  for (const id of ids) {
    const s = starts.get(id);
    if (s && (!min || s < min)) min = s;
  }
  return min;
}
