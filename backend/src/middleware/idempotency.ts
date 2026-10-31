import { createHash } from "crypto";
import type { NextFunction, Response } from "express";
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { idempotencyKeys } from "../db/schema";
import type { AuthRequest } from "./authenticate";

// Optional Idempotency-Key support for create endpoints (mounted after
// authenticateToken). Without the header the request runs as before.
//
// 1. Claim: INSERT (user_id, key) ... ON CONFLICT DO NOTHING. The unique
//    constraint makes this atomic — of two parallel requests with the same
//    key exactly one inserts; Postgres makes the other wait for the first
//    insert's commit, then see the conflict.
// 2. The winner runs the handler. A 2xx answer is stored with the row; any
//    other answer (validation error, 5xx) deletes the claim, because nothing
//    was created and the client may retry with the same key.
// 3. A repeat finds the row: stored answer → replayed with the original status
//    and body (header Idempotent-Replayed: true); still running → 409; same
//    key with a different request → 422.
// Keys are per user, so another user's key never collides. Rows expire after
// KEY_TTL_MS (removed by the nightly cleanup, and ignored/replaced here).

export const KEY_TTL_MS = 24 * 60 * 60 * 1000;
const KEY_RE = /^[A-Za-z0-9_-]{8,100}$/;

export function isValidIdempotencyKey(key: string): boolean {
  return KEY_RE.test(key);
}

export function requestFingerprint(method: string, path: string, body: unknown): string {
  return createHash("sha256").update(`${method} ${path}\n${JSON.stringify(body ?? null)}`).digest("hex");
}

export async function idempotent(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.get("Idempotency-Key");
  if (header === undefined) { next(); return; }
  const key = header.trim();
  if (!isValidIdempotencyKey(key)) {
    res.status(400).json({ error: "Invalid Idempotency-Key header.", code: "IDEMPOTENCY_KEY_INVALID" });
    return;
  }
  const userId = req.userId!;
  const path = (req.baseUrl + req.path).slice(0, 200);
  const hash = requestFingerprint(req.method, path, req.body);
  const now = new Date();

  try {
    // An expired record no longer protects anything; let this request reuse the key.
    await db.delete(idempotencyKeys).where(and(
      eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, key),
      lt(idempotencyKeys.createdAt, new Date(now.getTime() - KEY_TTL_MS)),
    ));

    const claimed = await db.insert(idempotencyKeys)
      .values({ userId, key, requestMethod: req.method, requestPath: path, requestHash: hash })
      .onConflictDoNothing({ target: [idempotencyKeys.userId, idempotencyKeys.key] })
      .returning({ key: idempotencyKeys.key });

    if (claimed.length === 0) {
      const [row] = await db.select().from(idempotencyKeys)
        .where(and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, key))).limit(1);
      if (!row) {
        // Released between our insert and select (the first request failed): ask for a retry.
        res.status(409).json({ error: "A request with this Idempotency-Key is still being processed.", code: "IDEMPOTENCY_IN_PROGRESS" });
        return;
      }
      if (row.requestHash !== hash || row.requestPath !== path || row.requestMethod !== req.method) {
        res.status(422).json({ error: "This Idempotency-Key was already used for a different request.", code: "IDEMPOTENCY_KEY_REUSED" });
        return;
      }
      if (row.responseStatus == null) {
        res.set("Retry-After", "1");
        res.status(409).json({ error: "A request with this Idempotency-Key is still being processed.", code: "IDEMPOTENCY_IN_PROGRESS" });
        return;
      }
      res.set("Idempotent-Replayed", "true");
      res.status(row.responseStatus).json(row.responseBody);
      return;
    }
  } catch (err) {
    next(err);
    return;
  }

  // We own the key: store the answer before it goes out, so a retry that
  // arrives right after the response already sees it.
  const where = and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, key));
  const json = res.json.bind(res);
  let settled = false;
  res.json = ((body: unknown) => {
    if (settled) return json(body);
    settled = true;
    const status = res.statusCode;
    const persist = status >= 200 && status < 300
      ? db.update(idempotencyKeys).set({ responseStatus: status, responseBody: sql`${JSON.stringify(body ?? null)}::jsonb` }).where(where)
      : db.delete(idempotencyKeys).where(where);
    persist.then(() => json(body), (err) => {
      console.error("idempotency: storing the response failed:", err);
      json(body);
    });
    return res;
  }) as Response["json"];
  next();
}
