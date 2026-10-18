import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { categories, users } from "../db/schema";
import { familyMemberIds } from "./household";

// Categories are per user, so "the same category" across the family is matched
// by type + trimmed, case-insensitive name (the same pairing household stats use).
const sameName = (name: string) => sql`lower(btrim(${categories.name})) = lower(btrim(${name}))`;

async function sharingMemberIds(userId: string): Promise<string[] | null> {
  const [u] = await db
    .select({ householdId: users.householdId, enabled: users.householdEnabled })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!u?.householdId || !u.enabled) return null;
  const rows = await familyMemberIds(u.householdId);
  const ids = rows.map((r) => r.id);
  return ids.includes(userId) ? ids : null;
}

export class NotSharingError extends Error {}

// Marks the given expense categories of `userId` as shared. Every sharing member
// gets a copy (created when missing) and all copies share one limit: the average
// of the limits the members had set.
export async function shareCategories(userId: string, ids: string[]): Promise<void> {
  const members = await sharingMemberIds(userId);
  if (!members) throw new NotSharingError();

  const own = await db
    .select()
    .from(categories)
    .where(and(inArray(categories.id, ids), eq(categories.userId, userId), eq(categories.type, "expense")));

  await db.transaction(async (tx) => {
    for (const cat of own) {
      const copies = await tx
        .select()
        .from(categories)
        .where(and(inArray(categories.userId, members), eq(categories.type, "expense"), sameName(cat.name)));

      const limits = copies.map((c) => Number(c.budgetLimit)).filter((n) => Number.isFinite(n) && n > 0);
      const avg = limits.length ? String(Math.round((limits.reduce((a, b) => a + b, 0) / limits.length) * 100) / 100) : null;

      const have = new Set(copies.map((c) => c.userId));
      for (const memberId of members) {
        if (have.has(memberId)) continue;
        await tx.insert(categories).values({
          userId: memberId,
          name: cat.name,
          type: "expense",
          color: cat.color,
          icon: cat.icon,
          budgetLimit: avg,
          autoLimit: false,
          shared: true,
        });
      }
      await tx
        .update(categories)
        .set({ shared: true, autoLimit: false, budgetLimit: avg })
        .where(and(inArray(categories.userId, members), eq(categories.type, "expense"), sameName(cat.name)));
    }
  });
}

// Only the caller's own copy stops being shared; the others keep theirs.
export async function unshareCategories(userId: string, ids: string[]): Promise<void> {
  await db
    .update(categories)
    .set({ shared: false })
    .where(and(inArray(categories.id, ids), eq(categories.userId, userId)));
}

// A new limit on one shared copy applies to everyone's copy.
export async function propagateSharedLimit(userId: string, name: string, budgetLimit: string | null): Promise<void> {
  const members = await sharingMemberIds(userId);
  if (!members) return;
  await db
    .update(categories)
    .set({ budgetLimit })
    .where(and(
      inArray(categories.userId, members),
      eq(categories.type, "expense"),
      eq(categories.shared, true),
      sameName(name),
    ));
}

// Leaving or being removed ends sharing for that user's categories.
export async function unshareAllFor(userId: string): Promise<void> {
  await db.update(categories).set({ shared: false }).where(eq(categories.userId, userId));
}
