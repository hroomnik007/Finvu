import { describe, expect, it } from "vitest";
import { HALF_LIFE_DAYS, suggestCategory, type SuggestHistoryRow } from "./categorySuggest";

const TODAY = "2026-11-01";
const h = (description: string, categoryId: string, date = "2026-10-20"): SuggestHistoryRow => ({ description, categoryId, date });

describe("suggestCategory", () => {
  it("returns nothing for short or empty text", () => {
    expect(suggestCategory("", [], [h("a", "c1")], TODAY)).toBeNull();
    expect(suggestCategory(" a ", [], [h("a", "c1")], TODAY)).toBeNull();
  });

  it("a rule keyword wins over history, longest keyword first", () => {
    const rules = [{ keyword: "lidl", categoryId: "food" }, { keyword: "lidl mobile", categoryId: "phone" }];
    expect(suggestCategory("Platba LIDL Bratislava", rules, [h("platba lidl bratislava", "other")], TODAY))
      .toEqual({ categoryId: "food", source: "rule" });
    expect(suggestCategory("Lidl Mobile dobitie", rules, [], TODAY)).toEqual({ categoryId: "phone", source: "rule" });
  });

  it("matches history ignoring case, diacritics and whitespace", () => {
    const history = [h("Kávička  ", "coffee"), h("KAVICKA", "coffee"), h("kavicka", "food")];
    expect(suggestCategory("  kávička", [], history, TODAY)).toEqual({ categoryId: "coffee", source: "history", matches: 2 });
  });

  it("needs the whole description, not a part of it", () => {
    expect(suggestCategory("kav", [], [h("kavicka", "coffee")], TODAY)).toBeNull();
  });

  it("prefers recent picks: older uses count half every half-life", () => {
    const old = (d: number) => new Date(Date.parse(TODAY) - d * 86_400_000).toISOString().slice(0, 10);
    // three uses a year ago vs two this week
    const history = [h("obed", "food", old(365)), h("obed", "food", old(366)), h("obed", "food", old(367)), h("obed", "work", old(2)), h("obed", "work", old(3))];
    expect(suggestCategory("obed", [], history, TODAY)?.categoryId).toBe("work");
    // but frequency still wins at similar ages
    const close = [h("obed", "food", old(10)), h("obed", "food", old(11)), h("obed", "work", old(5))];
    expect(suggestCategory("obed", [], close, TODAY)?.categoryId).toBe("food");
    expect(HALF_LIFE_DAYS).toBeGreaterThan(0);
  });

  it("breaks an exact tie by the row seen first (the query returns newest first)", () => {
    expect(suggestCategory("x1", [], [h("x1", "a", "2026-10-01"), h("x1", "b", "2026-10-01")], TODAY)?.categoryId).toBe("a");
    expect(suggestCategory("x1", [], [h("x1", "b", "2026-10-01"), h("x1", "a", "2026-10-01")], TODAY)?.categoryId).toBe("b");
  });

  it("skips rows without a category or description", () => {
    expect(suggestCategory("taxi", [], [{ description: "taxi", categoryId: null, date: TODAY }, { description: null, categoryId: "x", date: TODAY }], TODAY)).toBeNull();
  });
});
