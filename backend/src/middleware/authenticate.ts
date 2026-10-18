import { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
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
  // One round trip does both — the activity stamp and the status check (the
  // session-check endpoint must read the unmodified timestamp, so it only reads).
  const [account] = req.originalUrl.endsWith("/session-check")
    ? await db.select({ isDeactivated: users.isDeactivated }).from(users).where(eq(users.id, payload.userId)).limit(1)
    : await db
        .update(users)
        .set({ lastActiveAt: new Date() })
        .where(eq(users.id, payload.userId))
        .returning({ isDeactivated: users.isDeactivated });

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
