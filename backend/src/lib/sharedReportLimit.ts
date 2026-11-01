import { and, count, eq, gt, sql } from "drizzle-orm";
import { db } from "../db";
import { sharedReports } from "../db/schema";

// Most active (not yet expired) shared reports one user may hold. A report is
// up to 500 000 characters and lives up to 30 days, so without a cap one account
// could grow the table without bound. 20 is well above what anyone shares by hand
// (a link per month or per person) and bounds one user to ~10 MB of report text;
// expired reports are not counted, so the room comes back by itself.
export const MAX_ACTIVE_SHARED_REPORTS = 20;
export const SHARED_REPORT_LIMIT_CODE = "SHARED_REPORT_LIMIT";

export type CreateReportResult = { ok: true } | { ok: false; reason: "limit" };

// Count and insert run in one transaction under a per-user advisory lock, so two
// parallel POSTs for the same user take turns: the second one sees the first
// one's row and cannot slip past the cap. The lock is released at commit/rollback
// and only serialises requests of the same user.
export async function insertSharedReportWithinCap(
  row: { userId: string; token: string; data: string; expiresAt: Date },
  now: Date = new Date(),
): Promise<CreateReportResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"shared_reports:" + row.userId}, 0))`);
    const [{ active }] = await tx
      .select({ active: count() })
      .from(sharedReports)
      .where(and(eq(sharedReports.userId, row.userId), gt(sharedReports.expiresAt, now)));
    if (active >= MAX_ACTIVE_SHARED_REPORTS) return { ok: false, reason: "limit" } as const;
    await tx.insert(sharedReports).values(row);
    return { ok: true } as const;
  });
}
