// Texts of the mid-month summary e-mail (15th of the month) in the five app
// languages. Language is users.language; unknown or missing falls back to Slovak.
// Month names and the "Income" / "Expenses" labels are shared with the monthly e-mail.
import { monthlyEmailText } from "./monthlyEmailText";

export interface MidMonthEmailText {
  title: string;
  difference: string;
  rangeLabel: (monthName: string, year: number) => string;
  footerLead: string;
  footerBeforeLink: string;
  footerAfterLink: string;
}

const TEXTS: Record<string, MidMonthEmailText> = {
  sk: {
    title: "Finvu — Súhrn v polovici mesiaca",
    difference: "Rozdiel",
    rangeLabel: (m, y) => `1. – 15. ${m} ${y}`,
    footerLead: "Správu dostávaš, pretože máš zapnutý súhrn v polovici mesiaca v Finvu.",
    footerBeforeLink: "Vypnúť ho môžeš v ",
    footerAfterLink: ".",
  },
  cs: {
    title: "Finvu — Souhrn v polovině měsíce",
    difference: "Rozdíl",
    rangeLabel: (m, y) => `1. – 15. ${m} ${y}`,
    footerLead: "Zprávu dostáváš, protože máš zapnutý souhrn v polovině měsíce ve Finvu.",
    footerBeforeLink: "Vypnout ho můžeš v ",
    footerAfterLink: ".",
  },
  pl: {
    title: "Finvu — Podsumowanie w połowie miesiąca",
    difference: "Różnica",
    rangeLabel: (m, y) => `1 – 15 ${m} ${y}`,
    footerLead: "Otrzymujesz tę wiadomość, ponieważ masz włączone podsumowanie w połowie miesiąca we Finvu.",
    footerBeforeLink: "Możesz je wyłączyć w ",
    footerAfterLink: ".",
  },
  hu: {
    title: "Finvu — Hónap közepi összefoglaló",
    difference: "Különbözet",
    rangeLabel: (m, y) => `${y}. ${m} 1. – 15.`,
    footerLead: "Azért kapod ezt az üzenetet, mert a Finvuban be van kapcsolva a hónap közepi összefoglaló.",
    footerBeforeLink: "Kikapcsolhatod a ",
    footerAfterLink: ".",
  },
  en: {
    title: "Finvu — Mid-month summary",
    difference: "Difference",
    rangeLabel: (m, y) => `1 – 15 ${m} ${y}`,
    footerLead: "You are receiving this because you have the mid-month summary turned on in Finvu.",
    footerBeforeLink: "You can turn it off in ",
    footerAfterLink: ".",
  },
};

export function midMonthEmailText(language: string | null | undefined): MidMonthEmailText {
  return language && Object.prototype.hasOwnProperty.call(TEXTS, language) ? TEXTS[language] : TEXTS.sk;
}

// Subject, labels and the month name for one user, in their language.
export function midMonthLabels(language: string | null | undefined, month: number, year: number) {
  const t = midMonthEmailText(language);
  const shared = monthlyEmailText(language);
  const label = t.rangeLabel(shared.months[month - 1], year);
  return { t, shared, label, subject: `${t.title} (${label})` };
}
