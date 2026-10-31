import { normalizeKeyword } from "./importRules";

// Category suggestion for a typed description (GET /api/transactions/suggest-category).
// 1. A category rule whose keyword occurs in the text (longest keyword wins,
//    the same as the CSV import).
// 2. Otherwise the category the user picked most often for exactly this
//    description (case, diacritics and whitespace ignored). Each past use counts
//    less the older it is — half as much every HALF_LIFE_DAYS — so a recent
//    change of habit wins over an old one. Ties go to the most recent use.

export const HALF_LIFE_DAYS = 120;
export const MIN_QUERY_LENGTH = 2;
export const HISTORY_LIMIT = 2000;

export interface SuggestRule { keyword: string; categoryId: string }
export interface SuggestHistoryRow { description: string | null; categoryId: string | null; date: string }
export interface CategorySuggestion { categoryId: string; source: "rule" | "history"; matches?: number }

const DAY_MS = 86_400_000;

export function suggestCategory(
  query: string,
  rules: SuggestRule[],
  history: SuggestHistoryRow[],
  today: string,
): CategorySuggestion | null {
  const text = normalizeKeyword(query);
  if (text.length < MIN_QUERY_LENGTH) return null;

  let rule: SuggestRule | undefined;
  for (const r of rules) {
    const kw = normalizeKeyword(r.keyword);
    if (kw && text.includes(kw) && (!rule || kw.length > normalizeKeyword(rule.keyword).length)) rule = r;
  }
  if (rule) return { categoryId: rule.categoryId, source: "rule" };

  const now = Date.parse(today);
  const scores = new Map<string, { score: number; matches: number; last: string }>();
  for (const row of history) {
    if (!row.categoryId || !row.description || normalizeKeyword(row.description) !== text) continue;
    const ageDays = Math.max(0, (now - Date.parse(row.date)) / DAY_MS);
    const weight = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
    const s = scores.get(row.categoryId) ?? { score: 0, matches: 0, last: "" };
    s.score += weight; s.matches += 1;
    if (row.date > s.last) s.last = row.date;
    scores.set(row.categoryId, s);
  }
  let best: [string, { score: number; matches: number; last: string }] | undefined;
  for (const entry of scores) {
    if (!best || entry[1].score > best[1].score + 1e-9 || (Math.abs(entry[1].score - best[1].score) <= 1e-9 && entry[1].last > best[1].last)) best = entry;
  }
  return best ? { categoryId: best[0], source: "history", matches: best[1].matches } : null;
}
