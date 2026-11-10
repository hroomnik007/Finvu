import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

// The mid-month job must not mail deactivated accounts: capture the WHERE of
// its subscriber query and check it excludes them.
const captured = vi.hoisted(() => ({ where: undefined as unknown, job: undefined as undefined | (() => void) }));
vi.mock("node-cron", () => ({ default: { schedule: (_expr: string, fn: () => void) => { captured.job = fn; } } }));
vi.mock("../db", () => {
  const chain = (): unknown => new Proxy(function () {}, {
    get: (_t, prop) => {
      if (prop === "then") return (ok: (v: unknown) => void) => Promise.resolve([]).then(ok);
      if (prop === "where") return (w: unknown) => { captured.where ??= w; return chain(); };
      return () => chain();
    },
  });
  return { db: { select: () => chain() } };
});
vi.mock("../lib/email", () => ({ sendEmail: async () => {} }));

const { startWeeklyReportJob, renderMidMonthHtml } = await import("./weeklyReport");

describe("mid-month report subscribers", () => {
  it("exclude deactivated users", async () => {
    startWeeklyReportJob();
    captured.job!();
    await new Promise(r => setImmediate(r));
    const { sql, params } = new PgDialect().sqlToQuery(captured.where as never);
    expect(sql).toMatch(/"weekly_email_enabled" = \$1/);
    expect(sql).toMatch(/"is_deactivated" = \$2/);
    expect(params).toEqual([true, false]);
  });
});

describe("mid-month report e-mail text", () => {
  const data = { income: 1800, expense: 800, month: 10, year: 2026 };

  it("renders Slovak by default (unchanged wording) and for unknown languages", () => {
    for (const language of [undefined, null, "xx", "constructor"]) {
      const html = renderMidMonthHtml({ ...data, language });
      expect(html).toContain("Finvu — Súhrn v polovici mesiaca");
      expect(html).toContain("1. – 15. Október 2026");
      expect(html).toContain("Príjmy");
      expect(html).toContain("Rozdiel");
      expect(html).toContain('<html lang="sk">');
    }
  });

  it("renders each supported language", () => {
    const expected: Record<string, string[]> = {
      cs: ["Souhrn v polovině měsíce", "Příjmy", "Rozdíl", "Říjen 2026"],
      pl: ["Podsumowanie w połowie miesiąca", "Przychody", "Różnica", "Październik 2026"],
      hu: ["Hónap közepi összefoglaló", "Bevételek", "Különbözet", "2026. Október 1. – 15."],
      en: ["Mid-month summary", "Income", "Difference", "1 – 15 October 2026"],
    };
    for (const [language, words] of Object.entries(expected)) {
      const html = renderMidMonthHtml({ ...data, language });
      for (const w of words) expect(html).toContain(w);
      expect(html).toContain(`<html lang="${language}">`);
      expect(html).not.toContain("Príjmy");
      expect(html).not.toMatch(/undefined|NaN/);
    }
  });

  it("links the footer to the settings page, escaped, only when a URL is given", () => {
    const url = "https://finvu.pedani.eu/#settings";
    const html = renderMidMonthHtml({ ...data, language: "en", settingsUrl: url });
    expect(html).toMatch(/turn it off in <a href="https:\/\/finvu\.pedani\.eu\/#settings"[^>]*>Settings<\/a>\./);
    expect(renderMidMonthHtml({ ...data, settingsUrl: 'https://x/"><script>' })).not.toContain("<script>");
    expect(renderMidMonthHtml(data)).not.toContain("<a href");
  });
});
