import { describe, expect, it } from "vitest";
import { detectSubscriptions, normalizeDescription, similarNames, type VariableRow } from "./subscriptions";

const tx = (date: string, amount: number | string, description: string | null, categoryId: string | null = "cat-fun"): VariableRow =>
  ({ date, amount: String(amount), description, categoryId });
const fixedRow = (label: string, amount: number, date: string, d: number, endedOn: string | null = null) =>
  ({ description: JSON.stringify({ l: label, n: "", d }), amount: String(amount), date, endedOn });

const netflix = [
  tx("2026-07-14", 12.99, "NETFLIX.COM 4402*1234"),
  tx("2026-08-15", 12.99, "Platba kartou NETFLIX.COM"),
  tx("2026-09-13", 12.99, "NETFLIX.COM"),
];

describe("normalizeDescription", () => {
  it("drops card numbers, references, diacritics and bank boilerplate", () => {
    expect(normalizeDescription("Platba kartou NETFLIX.COM 4402*1234 12.08.")).toBe("netflix");
    expect(normalizeDescription("SEPA inkaso O2 Slovakia s.r.o. VS 123456")).toBe("slovakia");
    expect(normalizeDescription("Spotify P2F9D1A3C Stockholm")).toBe("spotify stockholm");
    expect(normalizeDescription("Fitko Žilina")).toBe("fitko zilina");
    expect(normalizeDescription(null)).toBe("");
    expect(normalizeDescription("12345")).toBe("");
  });

  it("treats a longer name with the same start, or a near spelling, as the same merchant", () => {
    expect(similarNames("spotify", "spotify stockholm")).toBe(true);
    expect(similarNames("youtube premium", "youtube premum")).toBe(true);
    expect(similarNames("lidl", "billa")).toBe(false);
    expect(similarNames("", "")).toBe(false);
  });
});

describe("detectSubscriptions", () => {
  it("finds a monthly charge on about the same day for the same amount", () => {
    const [s, ...rest] = detectSubscriptions(netflix, [], "2026-09-20");
    expect(rest).toHaveLength(0);
    expect(s).toMatchObject({ key: "netflix", amount: 12.99, dayOfMonth: 13, occurrences: 3, lastDate: "2026-09-13", nextDate: "2026-10-13", categoryId: "cat-fun" });
    expect(s.name).toBe("NETFLIX.COM");
  });

  it("needs at least three months in a row", () => {
    expect(detectSubscriptions(netflix.slice(1), [], "2026-09-20")).toEqual([]);
    // a skipped month breaks the run
    const gap = [tx("2026-05-14", 12.99, "Netflix"), tx("2026-06-14", 12.99, "Netflix"), tx("2026-08-14", 12.99, "Netflix"), tx("2026-09-14", 12.99, "Netflix")];
    expect(detectSubscriptions(gap, [], "2026-09-20")).toEqual([]);
  });

  it("allows the day to move by up to 4 and the amount by up to 5 %", () => {
    const ok = [tx("2026-07-10", 10.0, "Gym"), tx("2026-08-14", 10.4, "Gym"), tx("2026-09-10", 10.2, "Gym")];
    expect(detectSubscriptions(ok, [], "2026-09-11")).toHaveLength(1);
    const lateDay = [tx("2026-07-04", 10, "Gym"), tx("2026-08-10", 10, "Gym"), tx("2026-09-10", 10, "Gym")];
    expect(detectSubscriptions(lateDay, [], "2026-09-11")).toEqual([]);
    const pricier = [tx("2026-07-10", 9.4, "Gym"), tx("2026-08-10", 10, "Gym"), tx("2026-09-10", 10, "Gym")];
    expect(detectSubscriptions(pricier, [], "2026-09-11")).toEqual([]);
  });

  it("clamps the usual day to short months (31 Jan, 28 Feb, 31 Mar)", () => {
    const rows = [tx("2026-01-31", 5, "iCloud"), tx("2026-02-28", 5, "iCloud"), tx("2026-03-31", 5, "iCloud")];
    const [s] = detectSubscriptions(rows, [], "2026-04-02");
    expect(s).toMatchObject({ dayOfMonth: 28, nextDate: "2026-04-30" });
  });

  it("ignores habits with several same-sized charges a month", () => {
    const coffee: VariableRow[] = [];
    for (const m of ["07", "08", "09"]) for (const d of ["05", "12", "19", "26"]) coffee.push(tx(`2026-${m}-${d}`, 2.5, "Kaviareň Pod Hradom"));
    expect(detectSubscriptions(coffee, [], "2026-09-27")).toEqual([]);
  });

  it("keeps a subscription when the same shop also has other, differently sized purchases", () => {
    const rows = [...netflix, tx("2026-08-02", 3.99, "NETFLIX.COM game"), tx("2026-09-25", 49, "Netflix shop")];
    expect(detectSubscriptions(rows, [], "2026-09-26")).toHaveLength(1);
  });

  it("drops a subscription that has stopped", () => {
    // last charge 13 Sep, it is 20 Oct and nothing in October
    expect(detectSubscriptions(netflix, [], "2026-10-20")).toEqual([]);
    // within the tolerance it still counts, and the next charge is this month's
    const [s] = detectSubscriptions(netflix, [], "2026-10-16");
    expect(s.nextDate).toBe("2026-10-13");
  });

  it("skips what is already a running fixed expense (by name, or by amount and day)", () => {
    expect(detectSubscriptions(netflix, [fixedRow("Netflix", 12.99, "2026-01-01", 13)], "2026-09-20")).toEqual([]);
    expect(detectSubscriptions(netflix, [fixedRow("Filmy", 12.99, "2026-01-01", 15)], "2026-09-20")).toEqual([]);
    // an ended fixed expense does not count, nor one for a different amount and name
    expect(detectSubscriptions(netflix, [fixedRow("Netflix", 12.99, "2026-01-01", 13, "2026-06-01")], "2026-09-20")).toHaveLength(1);
    expect(detectSubscriptions(netflix, [fixedRow("Nájom", 550, "2026-01-01", 13)], "2026-09-20")).toHaveLength(1);
    // the latest row of a series decides: ended in its later row
    const priceChange = [fixedRow("Netflix", 11.99, "2026-01-01", 13, "2026-08-01"), fixedRow("Netflix", 12.99, "2026-05-01", 13, "2026-08-01")];
    expect(detectSubscriptions(netflix, priceChange, "2026-09-20")).toHaveLength(1);
  });

  it("leaves out dismissed patterns", () => {
    expect(detectSubscriptions(netflix, [], "2026-09-20", ["netflix"])).toEqual([]);
    expect(detectSubscriptions(netflix, [], "2026-09-20", ["spotify"])).toHaveLength(1);
  });

  it("ignores rows without a usable description, future rows, and zero amounts", () => {
    const rows = [tx("2026-07-10", 9, null), tx("2026-08-10", 9, null), tx("2026-09-10", 9, null),
      tx("2026-07-10", 0, "Free"), tx("2026-08-10", 0, "Free"), tx("2026-09-10", 0, "Free"),
      ...netflix.slice(0, 2), tx("2026-09-30", 12.99, "Netflix")];
    expect(detectSubscriptions(rows, [], "2026-09-20")).toEqual([]);
  });

  it("lists several, largest first", () => {
    const rows = [...netflix, tx("2026-07-02", 29, "Fitko"), tx("2026-08-01", 29, "Fitko"), tx("2026-09-03", 29, "Fitko")];
    expect(detectSubscriptions(rows, [], "2026-09-20").map(s => s.key)).toEqual(["fitko", "netflix"]);
  });
});
