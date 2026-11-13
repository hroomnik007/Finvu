// The app's home time zone: "today" for a user is the calendar day there, not in UTC
// (which is still the previous day for the first hour or two after local midnight).
export const APP_TIME_ZONE = "Europe/Bratislava";

// YYYY-MM-DD of a moment in the given time zone
export function localDateISO(at: Date = new Date(), timeZone: string = APP_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

// "Today" in the app's time zone as a Date whose LOCAL getters (getFullYear,
// getMonth, getDate) give that calendar day — whatever zone the server runs in.
// Pass it wherever a calculation asks "has this day arrived yet": a container on
// UTC would otherwise still be on yesterday for an hour or two after midnight.
export function appToday(at: Date = new Date(), timeZone: string = APP_TIME_ZONE): Date {
  const [y, m, d] = localDateISO(at, timeZone).split("-").map(Number);
  return new Date(y, m - 1, d);
}
