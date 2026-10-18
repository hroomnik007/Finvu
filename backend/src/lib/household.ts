import { and, eq, ne } from "drizzle-orm";
import { db } from "../db";
import { users, households, householdMembers } from "../db/schema";

// Current members of a household. A row in household_members only counts when
// the user's own household_id still points at the same household, so stale
// memberships (user switched/left) never leak data in either direction.
//
// "Family" scope is derived from membership — NOT from transactions.household_id,
// which is stamped once at creation time and therefore misses rows created
// before the member joined (or while their household toggle was off).
export function familyMemberIds(householdId: number) {
  return db
    .select({ id: users.id })
    .from(users)
    .innerJoin(householdMembers, eq(householdMembers.userId, users.id))
    .where(and(eq(householdMembers.householdId, householdId), eq(users.householdId, householdId)));
}

// households.created_by has no ON DELETE action, so a user who founded a
// household cannot be deleted until ownership moves on (or the household,
// when they were the last member, is removed). Must run before db.delete(users).
export async function releaseOwnedHouseholds(userId: string): Promise<void> {
  const owned = await db.select({ id: households.id }).from(households).where(eq(households.createdBy, userId));
  for (const h of owned) {
    const [next] = await db
      .select({ userId: householdMembers.userId })
      .from(householdMembers)
      .where(and(eq(householdMembers.householdId, h.id), ne(householdMembers.userId, userId)))
      .orderBy(householdMembers.joinedAt)
      .limit(1);
    if (next) {
      await db.update(households).set({ createdBy: next.userId }).where(eq(households.id, h.id));
    } else {
      await db.delete(households).where(eq(households.id, h.id));
    }
  }
}
