import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { zodDetails } from "../lib/validation";
import { describeError } from "../lib/safeErrorLog";

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation error", details: zodDetails(err) });
    return;
  }

  const status = err instanceof Error ? (err as Error & { status?: number }).status ?? 500 : 500;

  if (status >= 500) {
    // Never hand the cause to the client, and never log it whole either:
    // Drizzle/pg errors carry the SQL text, bound parameters and `detail`
    // (e.g. the e-mail address on a unique violation). describeError keeps
    // only name, pg code/constraint/table/routine, a redacted message and the
    // stack frames. The query string is left out of the logged URL for the
    // same reason (search terms).
    console.error(`[error] ${req.method} ${req.originalUrl.split("?")[0]}: ${describeError(err)}`);
    res.status(status).json({ error: "Internal server error" });
    return;
  }

  res.status(status).json({ error: err instanceof Error ? err.message : "Request failed" });
}
