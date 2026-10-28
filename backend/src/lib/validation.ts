import type { ZodError } from "zod";

// What a client gets back for a 400: where it failed and a readable message.
// Zod's own issue objects also carry internal fields (regex patterns, formats,
// expected/received types) that the frontend never needs.
export function zodDetails(error: ZodError): { path: (string | number)[]; message: string }[] {
  return error.issues.map(issue => ({
    path: issue.path.map(p => (typeof p === "number" ? p : String(p))),
    message: issue.message,
  }));
}
