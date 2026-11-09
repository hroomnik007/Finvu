import { activeSeriesTotal, type FixedRow } from "./recurring";

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


// The household's view of each shared category (keyed by trimmed lower-case
// name): the active fixed expenses of all members added up and the reserve for
// variable spending that applies (the shared copies carry one common reserve;
// older data with differing reserves falls back to the largest). Only totals
// leave this function, never other members' transactions.
export function summarizeSharedFixed(input: {
  copies: { id: string; name: string; shared: boolean | null; limitReserve: string | null }[];
  fixedRows: (FixedRow & { categoryId: string | null })[];
  year: number;
  month: number;
}): Map<string, { fixedTotal: number; reserve: number }> {
  const key = (name: string) => name.trim().toLowerCase();
  const nameOf = new Map(input.copies.map((c) => [c.id, key(c.name)]));
  const rowsByName = new Map<string, FixedRow[]>();
  for (const row of input.fixedRows) {
    const name = row.categoryId ? nameOf.get(row.categoryId) : undefined;
    if (name === undefined) continue;
    const list = rowsByName.get(name) ?? [];
    list.push(row);
    rowsByName.set(name, list);
  }
  const out = new Map<string, { fixedTotal: number; reserve: number }>();
  for (const c of input.copies) {
    const name = key(c.name);
    const prev = out.get(name);
    const reserve = c.shared ? Number(c.limitReserve ?? 0) || 0 : 0;
    if (prev) {
      prev.reserve = Math.max(prev.reserve, reserve);
      continue;
    }
    const fixedTotal = Math.round(activeSeriesTotal(rowsByName.get(name) ?? [], input.year, input.month) * 100) / 100;
    out.set(name, { fixedTotal, reserve });
  }
  return out;
}
