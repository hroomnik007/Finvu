import { inArray } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";
import { startMonthOf } from "./trackingStart";

// Start month (see trackingStart.ts) of each of the given users.
export async function loadStartMonths(ids: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const rows = await db
    .select({ id: users.id, trackingStartDate: users.trackingStartDate, createdAt: users.createdAt })
    .from(users)
    .where(inArray(users.id, [...ids]));
  for (const r of rows) {
    const s = startMonthOf(r.trackingStartDate, r.createdAt);
    if (s) out.set(r.id, s);
  }
  return out;
}
