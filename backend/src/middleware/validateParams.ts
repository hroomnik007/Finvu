import { Request, Response, NextFunction } from "express";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// For router.param(): a malformed id would otherwise reach Postgres, fail with
// "invalid input syntax for type uuid" and surface as a 500.
export function uuidParam(req: Request, res: Response, next: NextFunction, value: string): void {
  if (!UUID_RE.test(value)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  next();
}
