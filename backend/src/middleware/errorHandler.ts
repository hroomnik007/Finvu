import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation error", details: err.issues });
    return;
  }

  const status = err instanceof Error ? (err as Error & { status?: number }).status ?? 500 : 500;

  if (status >= 500) {
    // Log the real cause, but never hand it to the client: Drizzle/pg messages
    // contain the SQL text and sometimes parameter values.
    console.error(`[error] ${req.method} ${req.originalUrl}:`, err);
    res.status(status).json({ error: "Internal server error" });
    return;
  }

  res.status(status).json({ error: err instanceof Error ? err.message : "Request failed" });
}
