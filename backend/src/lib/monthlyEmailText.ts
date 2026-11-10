// Texts of the monthly summary e-mail in the five app languages. The language is
// users.language; anything unknown or missing falls back to Slovak (the column default).
export type EmailLang = "sk" | "cs" | "pl" | "hu" | "en";

export interface MonthlyEmailText {
  subject: (monthLabel: string) => string;
  title: string;
  titleFamily: string;
  months: readonly string[];
  income: string;
  expense: string;
  balance: string;
  saved: (pct: string) => string;
  sameAsLast: string;
  diffVsLast: (sign: "+" | "−", n: number) => string;
  noIncome: string;
  byMember: string;
  topCategories: string;
  largest: string;
  noDescription: string;
  overLimit: string;
  shared: string;
  upcoming: string;
  today: string;
  tomorrow: string;
  inDays: (n: number) => string;
  more: (n: number) => string;
  total: string;
  payment: string;
  goals: string;
  paused: string;
  footerLead: string;
  footerBeforeLink: string;
  footerLink: string;
  footerAfterLink: string;
}

const sk: MonthlyEmailText = {
  subject: (m) => `Finvu — Mesačný súhrn (${m})`,
  title: "Finvu — Mesačný súhrn",
  titleFamily: "Finvu — Mesačný súhrn rodiny",
  months: ["Január", "Február", "Marec", "Apríl", "Máj", "Jún", "Júl", "August", "September", "Október", "November", "December"],
  income: "Príjmy",
  expense: "Výdavky",
  balance: "Zostatok",
  saved: (p) => `Odložených ${p} príjmov`,
  sameAsLast: " — rovnako ako minulý mesiac",
  diffVsLast: (s, n) => ` (${s}${n}\u00a0p.\u00a0b. oproti minulému mesiacu)`,
  noIncome: "Tento mesiac si nemal žiadne príjmy.",
  byMember: "Rodina podľa členov",
  topCategories: "Najväčšie kategórie výdavkov",
  largest: "Najväčšia jednotlivá platba",
  noDescription: "Bez popisu",
  overLimit: "Prekročený limit",
  shared: "(spoločná)",
  upcoming: "Čo ťa čaká budúci mesiac",
  today: "dnes",
  tomorrow: "zajtra",
  inDays: (n) => `o ${n} dní`,
  more: (n) => `… a ďalších ${n}`,
  total: "Spolu",
  payment: "Platba",
  goals: "Sporiace ciele",
  paused: "(pozastavený)",
  footerLead: "Správu dostávaš, pretože máš zapnutý mesačný súhrn vo Finvu.",
  footerBeforeLink: "Vypnúť ho alebo zmeniť čas odoslania môžeš v ",
  footerLink: "Nastaveniach",
  footerAfterLink: ".",
};

const cs: MonthlyEmailText = {
  subject: (m) => `Finvu — Měsíční souhrn (${m})`,
  title: "Finvu — Měsíční souhrn",
  titleFamily: "Finvu — Měsíční souhrn rodiny",
  months: ["Leden", "Únor", "Březen", "Duben", "Květen", "Červen", "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec"],
  income: "Příjmy",
  expense: "Výdaje",
  balance: "Zůstatek",
  saved: (p) => `Odloženo ${p} příjmů`,
  sameAsLast: " — stejně jako minulý měsíc",
  diffVsLast: (s, n) => ` (${s}${n}\u00a0p.\u00a0b. oproti minulému měsíci)`,
  noIncome: "V tomto měsíci nebyly žádné příjmy.",
  byMember: "Rodina podle členů",
  topCategories: "Největší kategorie výdajů",
  largest: "Největší jednotlivá platba",
  noDescription: "Bez popisu",
  overLimit: "Překročený limit",
  shared: "(společná)",
  upcoming: "Co tě čeká příští měsíc",
  today: "dnes",
  tomorrow: "zítra",
  inDays: (n) => `za ${n} ${n >= 2 && n <= 4 ? "dny" : "dní"}`,
  more: (n) => `… a dalších ${n}`,
  total: "Celkem",
  payment: "Platba",
  goals: "Spořicí cíle",
  paused: "(pozastaveno)",
  footerLead: "Zprávu dostáváš, protože máš zapnutý měsíční souhrn ve Finvu.",
  footerBeforeLink: "Vypnout ho nebo změnit čas odeslání můžeš v ",
  footerLink: "Nastavení",
  footerAfterLink: ".",
};

const pl: MonthlyEmailText = {
  subject: (m) => `Finvu — Podsumowanie miesiąca (${m})`,
  title: "Finvu — Podsumowanie miesiąca",
  titleFamily: "Finvu — Podsumowanie miesiąca rodziny",
  months: ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"],
  income: "Przychody",
  expense: "Wydatki",
  balance: "Saldo",
  saved: (p) => `Odłożono ${p} przychodów`,
  sameAsLast: " — tak samo jak w poprzednim miesiącu",
  diffVsLast: (s, n) => ` (${s}${n}\u00a0p.\u00a0proc. w porównaniu z poprzednim miesiącem)`,
  noIncome: "W tym miesiącu nie było żadnych przychodów.",
  byMember: "Rodzina według członków",
  topCategories: "Największe kategorie wydatków",
  largest: "Największa pojedyncza płatność",
  noDescription: "Bez opisu",
  overLimit: "Przekroczony limit",
  shared: "(wspólna)",
  upcoming: "Co cię czeka w przyszłym miesiącu",
  today: "dziś",
  tomorrow: "jutro",
  inDays: (n) => `za ${n} dni`,
  more: (n) => `… i ${n} więcej`,
  total: "Razem",
  payment: "Płatność",
  goals: "Cele oszczędnościowe",
  paused: "(wstrzymany)",
  footerLead: "Otrzymujesz tę wiadomość, ponieważ masz włączone miesięczne podsumowanie we Finvu.",
  footerBeforeLink: "Możesz je wyłączyć lub zmienić godzinę wysyłki w ",
  footerLink: "Ustawieniach",
  footerAfterLink: ".",
};

const hu: MonthlyEmailText = {
  subject: (m) => `Finvu — Havi összefoglaló (${m})`,
  title: "Finvu — Havi összefoglaló",
  titleFamily: "Finvu — Családi havi összefoglaló",
  months: ["Január", "Február", "Március", "Április", "Május", "Június", "Július", "Augusztus", "Szeptember", "Október", "November", "December"],
  income: "Bevételek",
  expense: "Kiadások",
  balance: "Egyenleg",
  saved: (p) => `Megtakarítási ráta: ${p}`,
  sameAsLast: " — ugyanannyi, mint a múlt hónapban",
  diffVsLast: (s, n) => ` (${s}${n} százalékpont a múlt hónaphoz képest)`,
  noIncome: "Ebben a hónapban nem volt bevétel.",
  byMember: "Család tagonként",
  topCategories: "Legnagyobb kiadási kategóriák",
  largest: "Legnagyobb egyedi fizetés",
  noDescription: "Leírás nélkül",
  overLimit: "Túllépett limit",
  shared: "(közös)",
  upcoming: "Mi vár rád jövő hónapban",
  today: "ma",
  tomorrow: "holnap",
  inDays: (n) => `${n} nap múlva`,
  more: (n) => `… és még ${n}`,
  total: "Összesen",
  payment: "Fizetés",
  goals: "Megtakarítási célok",
  paused: "(szüneteltetve)",
  footerLead: "Azért kapod ezt az üzenetet, mert a Finvuban be van kapcsolva a havi összefoglaló.",
  footerBeforeLink: "Kikapcsolhatod, vagy módosíthatod a küldés idejét a ",
  footerLink: "Beállításokban",
  footerAfterLink: ".",
};

const en: MonthlyEmailText = {
  subject: (m) => `Finvu — Monthly summary (${m})`,
  title: "Finvu — Monthly summary",
  titleFamily: "Finvu — Family monthly summary",
  months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  income: "Income",
  expense: "Expenses",
  balance: "Balance",
  saved: (p) => `Saved ${p} of income`,
  sameAsLast: " — same as last month",
  diffVsLast: (s, n) => ` (${s}${n} pp vs last month)`,
  noIncome: "You had no income this month.",
  byMember: "Family by member",
  topCategories: "Biggest expense categories",
  largest: "Largest single payment",
  noDescription: "No description",
  overLimit: "Over budget",
  shared: "(shared)",
  upcoming: "Coming up next month",
  today: "today",
  tomorrow: "tomorrow",
  inDays: (n) => `in ${n} days`,
  more: (n) => `… and ${n} more`,
  total: "Total",
  payment: "Payment",
  goals: "Savings goals",
  paused: "(paused)",
  footerLead: "You are receiving this because you have the monthly summary turned on in Finvu.",
  footerBeforeLink: "You can turn it off or change the sending time in ",
  footerLink: "Settings",
  footerAfterLink: ".",
};

const TEXTS: Record<EmailLang, MonthlyEmailText> = { sk, cs, pl, hu, en };

export function resolveEmailLang(language: string | null | undefined): EmailLang {
  return language && Object.prototype.hasOwnProperty.call(TEXTS, language) ? (language as EmailLang) : "sk";
}

export function monthlyEmailText(language: string | null | undefined): MonthlyEmailText {
  return TEXTS[resolveEmailLang(language)];
}
