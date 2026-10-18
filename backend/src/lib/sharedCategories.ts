import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { categories, transactions, users } from "../db/schema";
import { familyMemberIds } from "./household";
import { pickSharedLimit } from "./sharedLimit";
import { activeSeriesTotal } from "./recurring";

// Categories are per user, so "the same category" across the family is matched
// by type + trimmed, case-insensitive name (the same pairing household stats use).
const sameName = (name: string) => sql`lower(btrim(${categories.name})) = lower(btrim(${name}))`;

export async function sharingMemberIds(userId: string): Promise<string[] | null> {
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

// The shared limit is the family's budget for the category:
//  - a category with fixed expenses: the fixed expenses of all members added up
//    (plus the largest reserve a member kept for variable spending),
//  - otherwise the highest limit any member set.
// A single member's limit therefore applies as-is when the others have none.
async function computeSharedLimit(members: string[], name: string): Promise<string | null> {
  const copies = await db
    .select()
    .from(categories)
    .where(and(inArray(categories.userId, members), eq(categories.type, "expense"), sameName(name)));
  if (copies.length === 0) return null;

  const today = new Date();
  const fixedRows = await db
    .select({ userId: transactions.userId, type: transactions.type, description: transactions.description, amount: transactions.amount, date: transactions.date, endedOn: transactions.endedOn })
    .from(transactions)
    .where(and(
      inArray(transactions.categoryId, copies.map((c) => c.id)),
      eq(transactions.isFixed, true),
      eq(transactions.type, "expense"),
    ))
    .orderBy(transactions.date);
  const limit = pickSharedLimit({
    fixedTotal: activeSeriesTotal(fixedRows, today.getFullYear(), today.getMonth() + 1),
    reserves: copies.map((c) => Number(c.limitReserve ?? 0)),
    limits: copies.map((c) => Number(c.budgetLimit)),
  });
  return limit != null ? String(limit) : null;
}

async function applySharedLimit(members: string[], name: string): Promise<void> {
  const limit = await computeSharedLimit(members, name);
  await db
    .update(categories)
    .set({ budgetLimit: limit })
    .where(and(
      inArray(categories.userId, members),
      eq(categories.type, "expense"),
      eq(categories.shared, true),
      sameName(name),
    ));
}

// Recomputes the limit of one shared category (a fixed expense or limit changed).
export async function recalcSharedLimit(userId: string, name: string): Promise<void> {
  const members = await sharingMemberIds(userId);
  if (members) await applySharedLimit(members, name);
}

// Recomputes every shared category of a household (membership or sharing changed).
export async function recalcSharedForHousehold(householdId: number): Promise<void> {
  const members = (await familyMemberIds(householdId)).map((r) => r.id);
  if (members.length === 0) return;
  const shared = await db
    .select({ name: categories.name })
    .from(categories)
    .where(and(inArray(categories.userId, members), eq(categories.type, "expense"), eq(categories.shared, true)));
  const names = new Map(shared.map((c) => [c.name.trim().toLowerCase(), c.name]));
  for (const name of names.values()) await applySharedLimit(members, name);
}

// Marks the given expense categories of `userId` as shared. Every sharing member
// gets a copy (created when missing) and all copies share one limit (see above).
export async function shareCategories(userId: string, ids: string[]): Promise<void> {
  const members = await sharingMemberIds(userId);
  if (!members) throw new NotSharingError();

  const own = await db
    .select()
    .from(categories)
    .where(and(inArray(categories.id, ids), eq(categories.userId, userId), eq(categories.type, "expense")));

  for (const cat of own) {
    const copies = await db
      .select({ userId: categories.userId })
      .from(categories)
      .where(and(inArray(categories.userId, members), eq(categories.type, "expense"), sameName(cat.name)));
    const have = new Set(copies.map((c) => c.userId));
    await db.transaction(async (tx) => {
      for (const memberId of members) {
        if (have.has(memberId)) continue;
        await tx.insert(categories).values({
          userId: memberId,
          name: cat.name,
          type: "expense",
          color: cat.color,
          icon: cat.icon,
          autoLimit: false,
          shared: true,
        });
      }
      await tx
        .update(categories)
        .set({ shared: true, autoLimit: false })
        .where(and(inArray(categories.userId, members), eq(categories.type, "expense"), sameName(cat.name)));
    });
    await applySharedLimit(members, cat.name);
  }
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

// A member who joins later gets the household's shared categories: ones they
// already have (same name) become shared, missing ones are created; the limits
// are then recomputed because their fixed expenses and limits now count too.
export async function syncSharedToNewMember(userId: string, householdId: number): Promise<void> {
  const memberIds = (await familyMemberIds(householdId)).map((r) => r.id).filter((id) => id !== userId);
  if (memberIds.length === 0) return;

  const shared = await db
    .select()
    .from(categories)
    .where(and(inArray(categories.userId, memberIds), eq(categories.type, "expense"), eq(categories.shared, true)));

  const byName = new Map<string, (typeof shared)[number]>();
  for (const c of shared) {
    const key = c.name.trim().toLowerCase();
    if (!byName.has(key)) byName.set(key, c);
  }

  for (const [, src] of byName) {
    const mine = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.userId, userId), eq(categories.type, "expense"), sameName(src.name)));
    if (mine.length > 0) {
      await db
        .update(categories)
        .set({ shared: true, autoLimit: false })
        .where(inArray(categories.id, mine.map((m) => m.id)));
    } else {
      await db.insert(categories).values({
        userId,
        name: src.name,
        type: "expense",
        color: src.color,
        icon: src.icon,
        autoLimit: false,
        shared: true,
      });
    }
  }
  await recalcSharedForHousehold(householdId);
}
