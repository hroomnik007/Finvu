// The app's home time zone: "today" for a user is the calendar day there, not in UTC
// (which is still the previous day for the first hour or two after local midnight).
export const APP_TIME_ZONE = "Europe/Bratislava";

// YYYY-MM-DD of a moment in the given time zone
export function localDateISO(at: Date = new Date(), timeZone: string = APP_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}
