import { Request, Response, NextFunction } from "express";
import { eq, sql } from "drizzle-orm";
import { verifyAccessToken } from "../lib/tokens";
import { db } from "../db";
import { users } from "../db/schema";

export interface AuthRequest extends Request {
  userId?: string;
  userEmail?: string;
}

export async function authenticateToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }

  let payload: ReturnType<typeof verifyAccessToken>;
  try {
    payload = verifyAccessToken(header.slice(7));
  } catch {
    res.status(401).json({ error: "Invalid or expired access token" });
    return;
  }

  // A valid signature is not enough: the account must still exist and be active,
  // otherwise a deactivated/deleted user keeps working until the token expires.
  // The session-check endpoint must read the unmodified timestamp, so it only reads.
  const [account] = req.originalUrl.endsWith("/session-check")
    ? await db.select({ isDeactivated: users.isDeactivated }).from(users).where(eq(users.id, payload.userId)).limit(1)
    : await touchAndCheckUser(payload.userId);

  if (!account) {
    res.status(401).json({ error: "Invalid or expired access token" });
    return;
  }
  if (account.isDeactivated) {
    res.status(401).json({ error: "Účet je deaktivovaný.", code: "ACCOUNT_DEACTIVATED" });
    return;
  }

  req.userId = payload.userId;
  req.userEmail = payload.email;
  next();
}

// last_active_at only feeds the PIN auto-lock check (session-check) and the
// admin user list, so it doesn't need a write on every request. It is only
// refreshed once it is older than a tenth of the user's auto-lock time (6 s for
// 1 minute, 90 s for 15 minutes), or 5 minutes when auto-lock is off. The
// stamp is then never more than 10% behind for the auto-lock check.
// One round trip: the optional update and the status check in one statement.
export async function touchAndCheckUser(userId: string, now = new Date()): Promise<{ isDeactivated: boolean }[]> {
  // The column is "timestamp without time zone" holding UTC, like drizzle writes it.
  const ts = now.toISOString();
  const result = await db.execute<{ is_deactivated: boolean }>(sql`
    WITH touched AS (
      UPDATE users SET last_active_at = ${ts}::timestamp
      WHERE id = ${userId}
        AND (last_active_at IS NULL
             OR last_active_at < ${ts}::timestamp - CASE
                  WHEN auto_lock_minutes > 0 THEN auto_lock_minutes * interval '6 seconds'
                  ELSE interval '5 minutes' END)
    )
    SELECT is_deactivated FROM users WHERE id = ${userId}`);
  return result.rows.map(r => ({ isDeactivated: r.is_deactivated }));
}
