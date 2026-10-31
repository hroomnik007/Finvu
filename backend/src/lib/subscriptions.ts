// Spots subscriptions hiding among one-off expenses: the same merchant charged
// once a month, for at least 3 months in a row, on about the same day and for
// about the same amount, that the user has not yet set up as a fixed expense.
// Pure functions: the controller feeds in the user's own rows.

export interface VariableRow {
  date: string; // YYYY-MM-DD
  amount: string | number;
  description: string | null;
  categoryId: string | null;
}

export interface FixedSeriesRow {
  description: string | null; // JSON { l, n, d } or plain text
  amount: string | number;
  date: string;
  endedOn?: string | null;
}

export interface SubscriptionSuggestion {
  /** Normalized merchant name: what a dismissal is stored under */
  key: string;
  /** Readable name for the card */
  name: string;
  amount: number;
  /** Usual day of the charge, 1-28 (what the fixed-expense form accepts) */
  dayOfMonth: number;
  categoryId: string | null;
  occurrences: number;
  lastDate: string;
  /** Expected date of the next charge: where a fixed expense should start */
  nextDate: string;
}

export const MIN_OCCURRENCES = 3;
export const DAY_TOLERANCE = 4;
export const AMOUNT_TOLERANCE = 0.05;

// Words bank statements add around merchant names
const NOISE = new Set([
  "platba", "kartou", "karta", "karty", "kartu", "card", "payment", "purchase", "nakup", "transakcia",
  "transakce", "platba", "pos", "sepa", "inkaso", "trvaly", "prikaz", "debit", "ref", "vs", "ks", "ss",
  "eur", "czk", "pln", "huf", "usd", "com", "www", "sk", "cz", "pl", "hu", "eu", "net", "the", "and",
  "srl", "sro", "s", "r", "o", "as", "ltd", "inc", "gmbh", "bv", "ab",
]);

function tokensOf(text: string): string[] {
  return text
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 1 && !/\d/.test(t) && !NOISE.has(t));
}

/** Merchant name without card numbers, dates, references and bank boilerplate. */
export function normalizeDescription(description: string | null): string {
  return tokensOf(description ?? "").slice(0, 4).join(" ");
}

function bigrams(s: string): string[] {
  const c = s.replace(/ /g, "");
  const out: string[] = [];
  for (let i = 0; i < c.length - 1; i++) out.push(c.slice(i, i + 2));
  return out;
}

function dice(a: string, b: string): number {
  const x = bigrams(a);
  const y = bigrams(b);
  if (!x.length || !y.length) return 0;
  const counts = new Map<string, number>();
  for (const g of x) counts.set(g, (counts.get(g) ?? 0) + 1);
  let hits = 0;
  for (const g of y) {
    const n = counts.get(g) ?? 0;
    if (n > 0) { hits++; counts.set(g, n - 1); }
  }
  return (2 * hits) / (x.length + y.length);
}

/** Two normalized names that are the same merchant ("spotify" / "spotify premium"). */
export function similarNames(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const ta = a.split(" ");
  const tb = b.split(" ");
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (short.join(" ").length >= 4 && short.every((t, i) => long[i] === t)) return true;
  return dice(a, b) >= 0.8;
}

function labelOf(description: string | null): string {
  if (!description) return "";
  try {
    const obj = JSON.parse(description);
    if (obj && typeof obj.l === "string") return obj.l;
  } catch { /* plain text */ }
  return description;
}

function fixedDay(description: string | null, date: string): number {
  try {
    const obj = JSON.parse(description ?? "");
    if (obj && typeof obj.d === "number") return obj.d;
  } catch { /* plain text */ }
  return Number(date.slice(8, 10));
}

const monthIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
const daysIn = (mi: number) => new Date(Date.UTC(Math.floor(mi / 12), (mi % 12) + 1, 0)).getUTCDate();
const dayOf = (iso: string) => Number(iso.slice(8, 10));
const isoOf = (mi: number, day: number) =>
  `${Math.floor(mi / 12)}-${String((mi % 12) + 1).padStart(2, "0")}-${String(Math.min(day, daysIn(mi))).padStart(2, "0")}`;

// Days apart within a month, with the usual day clamped to short months (31st -> 28 Feb)
function dayDistance(usualDay: number, iso: string): number {
  return Math.abs(Math.min(usualDay, daysIn(monthIndex(iso))) - dayOf(iso));
}

const close = (a: number, b: number) => Math.abs(a - b) <= AMOUNT_TOLERANCE * Math.max(a, b);

function displayName(description: string): string {
  const cleaned = description.split(/\s+/).filter(t => !/\d{3,}/.test(t)).join(" ").trim();
  const name = cleaned || description.trim();
  return name.length > 60 ? `${name.slice(0, 57)}…` : name;
}

interface Item { date: string; amount: number; key: string; description: string; categoryId: string | null }

/**
 * @param variable the user's own one-off expenses (any order)
 * @param fixed    the user's own fixed-expense rows (every row of every series)
 * @param today    YYYY-MM-DD in the app's time zone
 * @param dismissed normalized names the user hid
 */
export function detectSubscriptions(
  variable: VariableRow[],
  fixed: FixedSeriesRow[],
  today: string,
  dismissed: Iterable<string> = [],
): SubscriptionSuggestion[] {
  const hidden = new Set(dismissed);
  const items: Item[] = variable
    .map(r => ({
      date: r.date,
      amount: Math.round(Number(r.amount) * 100) / 100,
      key: normalizeDescription(r.description),
      description: (r.description ?? "").trim(),
      categoryId: r.categoryId,
    }))
    .filter(i => i.key && i.amount > 0 && i.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Group by merchant
  const clusters: { key: string; items: Item[] }[] = [];
  for (const it of items) {
    const c = clusters.find(c => similarNames(c.key, it.key));
    if (c) c.items.push(it); else clusters.push({ key: it.key, items: [it] });
  }

  // Running fixed expenses, one per series (its latest row)
  const series = new Map<string, FixedSeriesRow>();
  for (const f of fixed) {
    const k = f.description ?? "";
    const prev = series.get(k);
    if (!prev || f.date > prev.date) series.set(k, f);
  }
  const running = [...series.values()]
    .filter(f => !f.endedOn || f.endedOn > today)
    .map(f => ({ key: normalizeDescription(labelOf(f.description)), amount: Number(f.amount), day: fixedDay(f.description, f.date) }));

  const todayMi = monthIndex(today);
  const out: SubscriptionSuggestion[] = [];

  for (const c of clusters) {
    // Any charge from this or last month can anchor the run: the latest row may be a one-off purchase
    for (let a = c.items.length - 1; a >= 0 && monthIndex(c.items[a].date) >= todayMi - 1; a--) {
      const found = runFrom(c.items, c.items[a], c.key);
      if (found) { out.push(found); break; }
    }
  }

  function runFrom(clusterItems: Item[], anchor: Item, clusterKey: string): SubscriptionSuggestion | null {
    const usualDay = dayOf(anchor.date);
    // Walk back month by month from the anchor
    const run: Item[] = [anchor];
    for (let mi = monthIndex(anchor.date) - 1; ; mi--) {
      const fits = clusterItems.filter(i => monthIndex(i.date) === mi && close(i.amount, anchor.amount) && dayDistance(usualDay, i.date) <= DAY_TOLERANCE);
      if (!fits.length) break;
      fits.sort((x, y) => dayDistance(usualDay, x.date) - dayDistance(usualDay, y.date));
      run.unshift(fits[0]);
    }
    if (run.length < MIN_OCCURRENCES) return null;

    // Several same-sized charges a month (coffee, lunch) are a habit, not a subscription
    const first = monthIndex(run[0].date);
    const sameSized = clusterItems.filter(i => monthIndex(i.date) >= first && close(i.amount, anchor.amount)).length;
    if (sameSized > run.length) return null;

    // Still going: charged this month, or last month and this month's charge is not overdue
    const lastMi = monthIndex(anchor.date);
    const stillDue = lastMi === todayMi
      || (lastMi === todayMi - 1 && dayOf(today) <= Math.min(usualDay, daysIn(todayMi)) + DAY_TOLERANCE);
    if (!stillDue) return null;

    const keys = [...new Set([clusterKey, ...run.map(i => i.key)])];
    if (keys.some(k => hidden.has(k))) return null;

    const covered = running.some(f =>
      keys.some(k => similarNames(f.key, k))
      || (close(f.amount, anchor.amount) && Math.abs(f.day - Math.min(usualDay, 28)) <= DAY_TOLERANCE));
    if (covered) return null;

    // Next charge: next month when this month's is booked, otherwise this month's
    const nextMi = lastMi === todayMi ? todayMi + 1 : todayMi;
    return {
      key: anchor.key,
      name: displayName(anchor.description),
      amount: anchor.amount,
      dayOfMonth: Math.min(usualDay, 28),
      categoryId: anchor.categoryId,
      occurrences: run.length,
      lastDate: anchor.date,
      nextDate: isoOf(nextMi, usualDay),
    };
  }

  return out.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
}
