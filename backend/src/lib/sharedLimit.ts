// Limit of a shared category (the family's budget for it):
//  - with fixed expenses: all members' fixed expenses added up plus the largest
//    reserve a member kept for variable spending,
//  - otherwise: the highest limit any member set, so one member's limit applies
//    as-is when the others have none.
export function pickSharedLimit(input: { fixedTotal: number; reserves: number[]; limits: number[] }): number | null {
  if (input.fixedTotal > 0) {
    const reserve = input.reserves.length ? Math.max(...input.reserves) : 0;
    return Math.round((input.fixedTotal + reserve) * 100) / 100;
  }
  const limits = input.limits.filter((n) => Number.isFinite(n) && n > 0);
  return limits.length ? Math.max(...limits) : null;
}
