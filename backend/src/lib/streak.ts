// A streak counts consecutive calendar days (in the app's time zone) with a recorded entry.
// `last` and `today` are YYYY-MM-DD; a missing `last` means no activity yet.
export function nextStreak(current: number, last: string | null, today: string): number {
  if (!last) return 1;
  if (last === today) return current; // same day — no change
  const dayDiff = Math.round((new Date(today).getTime() - new Date(last).getTime()) / 86400000);
  return dayDiff === 1 ? current + 1 : 1;
}
