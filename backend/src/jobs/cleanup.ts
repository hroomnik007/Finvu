import cron from "node-cron";
import { and, isNotNull, lt, notExists, eq, gt, or } from "drizzle-orm";
import { db } from "../db";
import { refreshTokens, passwordResetTokens, pinDeviceTokens, sharedReports, userSessions, users } from "../db/schema";
import { cleanupCutoffs } from "../lib/cleanupCutoffs";

// Removes rows that can no longer be used: expired tokens, expired shared reports and
// sessions that have been idle for months without a live refresh token.
export async function runCleanup(now: Date = new Date()): Promise<Record<string, number>> {
  const cut = cleanupCutoffs(now);
  const removed: Record<string, number> = {};

  const refresh = await db
    .delete(refreshTokens)
    .where(or(lt(refreshTokens.expiresAt, cut.tokens), and(isNotNull(refreshTokens.revokedAt), lt(refreshTokens.revokedAt, cut.revokedTokens))))
    .returning({ id: refreshTokens.id });
  removed.refreshTokens = refresh.length;

  const reset = await db.delete(passwordResetTokens).where(lt(passwordResetTokens.expiresAt, cut.tokens)).returning({ id: passwordResetTokens.id });
  removed.passwordResetTokens = reset.length;

  const pin = await db.delete(pinDeviceTokens).where(lt(pinDeviceTokens.expiresAt, cut.tokens)).returning({ id: pinDeviceTokens.id });
  removed.pinDeviceTokens = pin.length;

  const reports = await db.delete(sharedReports).where(lt(sharedReports.expiresAt, cut.tokens)).returning({ id: sharedReports.id });
  removed.sharedReports = reports.length;

  const sessions = await db
    .delete(userSessions)
    .where(and(
      lt(userSessions.lastActive, cut.sessions),
      notExists(db.select({ id: refreshTokens.id }).from(refreshTokens).where(and(eq(refreshTokens.sessionId, userSessions.id), gt(refreshTokens.expiresAt, now)))),
    ))
    .returning({ id: userSessions.id });
  removed.userSessions = sessions.length;

  // Expired e-mail verification tokens: forget the token, keep the account
  const verification = await db
    .update(users)
    .set({ verificationToken: null, verificationExpiresAt: null })
    .where(and(isNotNull(users.verificationToken), lt(users.verificationExpiresAt, cut.tokens)))
    .returning({ id: users.id });
  removed.verificationTokens = verification.length;

  return removed;
}

export function startCleanupJob(): void {
  // Every night at 03:30 Bratislava time
  cron.schedule("30 3 * * *", () => {
    runCleanup()
      .then((removed) => console.log("[cleanup] Removed:", JSON.stringify(removed)))
      .catch((err) => console.error("[cleanup] Error:", err));
  }, { timezone: "Europe/Bratislava" });
  console.log("[cleanup] Scheduled: daily 03:30");
}
