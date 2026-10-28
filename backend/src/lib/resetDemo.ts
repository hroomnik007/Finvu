import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  users,
  categories,
  transactions,
  savingsGoals,
  households,
  householdMembers,
} from "../db/schema";

const DEMO_EMAIL  = "demo@finvu.sk";
const DEMO1_EMAIL = "lucia@finvu.sk";
const DEMO2_EMAIL = "tomas@finvu.sk";
const DEMO3_EMAIL = "adam@finvu.sk";

function d(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function lastThreeMonths(): Array<{ year: number; month: number }> {
  const now = new Date();
  const result = [];
  for (let i = 2; i >= 0; i--) {
    const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push({ year: dt.getFullYear(), month: dt.getMonth() + 1 });
  }
  return result;
}

const EXPENSE_CATS = [
  { name: "Potraviny",       type: "expense" as const, color: "#10B981", icon: "🛒", budgetLimit: "400"  },
  { name: "Reštaurácie",     type: "expense" as const, color: "#F97316", icon: "🍽️", budgetLimit: "150"  },
  { name: "Tankovanie",      type: "expense" as const, color: "#F59E0B", icon: "⛽", budgetLimit: "120"  },
  { name: "Oblečenie",       type: "expense" as const, color: "#EC4899", icon: "👕", budgetLimit: "100"  },
  { name: "Zábava",          type: "expense" as const, color: "#8B5CF6", icon: "🎭", budgetLimit: "80"   },
  { name: "Zdravie",         type: "expense" as const, color: "#EF4444", icon: "💊", budgetLimit: "60"   },
  { name: "Drogéria",        type: "expense" as const, color: "#06B6D4", icon: "🧴", budgetLimit: "50"   },
  { name: "Káva",            type: "expense" as const, color: "#92400E", icon: "☕", budgetLimit: "40"   },
  { name: "Bývanie",         type: "expense" as const, color: "#3B82F6", icon: "🏠", budgetLimit: null   },
  { name: "Energie",         type: "expense" as const, color: "#FBBF24", icon: "⚡", budgetLimit: null   },
  { name: "Telekomunikácie", type: "expense" as const, color: "#A78BFA", icon: "📡", budgetLimit: null   },
  { name: "Predplatné",      type: "expense" as const, color: "#22D3EE", icon: "📺", budgetLimit: null   },
  { name: "Poistenie",       type: "expense" as const, color: "#6366F1", icon: "🛡️", budgetLimit: null   },
];

const INCOME_CATS = [
  { name: "Plat",      type: "income" as const, color: "#34D399", icon: "💰", budgetLimit: null },
  { name: "Freelance", type: "income" as const, color: "#3B82F6", icon: "💻", budgetLimit: null },
  { name: "Brigáda",   type: "income" as const, color: "#A3E635", icon: "💼", budgetLimit: null },
];

const FIXED_DEFS = [
  { desc: "Nájom",               cat: "Bývanie",         amount: "650",  day: 1  },
  { desc: "Elektrina",           cat: "Energie",         amount: "45",   day: 14 },
  { desc: "Internet",            cat: "Telekomunikácie", amount: "25",   day: 20 },
  { desc: "Netflix",             cat: "Predplatné",      amount: "18",   day: 8  },
  { desc: "Spotify",             cat: "Predplatné",      amount: "10",   day: 8  },
  { desc: "Poistenie auta",      cat: "Poistenie",       amount: "58",   day: 15 },
  { desc: "Životné poistenie",   cat: "Poistenie",       amount: "35",   day: 15 },
];

/**
 * Resets the demo account to a known fresh state.
 * Called on every demo login — errors are caught and logged by the caller.
 */
export async function resetDemoAccount(userId: string): Promise<void> {
  const now = new Date();
  const todayYear  = now.getFullYear();
  const todayMonth = now.getMonth() + 1;
  const todayDay   = now.getDate();

  const MONTHS = lastThreeMonths();

  // ── 1. Fetch helper user IDs ─────────────────────────────────────────────
  const [lucia] = await db.select({ id: users.id })
    .from(users).where(eq(users.email, DEMO1_EMAIL)).limit(1);
  const [tomas] = await db.select({ id: users.id })
    .from(users).where(eq(users.email, DEMO2_EMAIL)).limit(1);
  const [adam] = await db.select({ id: users.id })
    .from(users).where(eq(users.email, DEMO3_EMAIL)).limit(1);

  // ── 2. Clear demo user's data ────────────────────────────────────────────
  await db.delete(transactions).where(eq(transactions.userId, userId));
  await db.delete(savingsGoals).where(eq(savingsGoals.userId, userId));
  await db.delete(categories).where(eq(categories.userId, userId));

  // ── 3. Clear existing household ──────────────────────────────────────────
  const [demoUser] = await db.select({ householdId: users.householdId })
    .from(users).where(eq(users.id, userId)).limit(1);

  if (demoUser?.householdId) {
    const hid = demoUser.householdId;
    await db.delete(householdMembers).where(eq(householdMembers.householdId, hid));
    await db.delete(households).where(eq(households.id, hid));
    const memberIds = [userId, lucia?.id, tomas?.id, adam?.id].filter(Boolean) as string[];
    await db.update(users)
      .set({ householdId: null, householdEnabled: false })
      .where(inArray(users.id, memberIds));
  }

  // ── 4. Re-create categories ───────────────────────────────────────────────
  const allCatDefs = [...EXPENSE_CATS, ...INCOME_CATS];
  const insertedCats = await db.insert(categories).values(
    allCatDefs.map(c => ({
      userId,
      name: c.name,
      type: c.type,
      color: c.color,
      icon: c.icon,
      isDefault: true,
      budgetLimit: c.budgetLimit ?? undefined,
      autoLimit: false,
    }))
  ).returning();

  const catMap = new Map(insertedCats.map(c => [c.name, c.id]));
  const cid = (name: string) => {
    const id = catMap.get(name);
    if (!id) throw new Error(`Category not found: ${name}`);
    return id;
  };

  // ── 5. Re-create household ────────────────────────────────────────────────
  const [household] = await db.insert(households).values({
    name: "Demových",
    inviteCode: "DEMO2026",
    createdBy: userId,
  }).returning();

  const memberRows = [
    { householdId: household.id, userId },
    ...(lucia ? [{ householdId: household.id, userId: lucia.id }] : []),
    ...(tomas ? [{ householdId: household.id, userId: tomas.id }] : []),
    ...(adam  ? [{ householdId: household.id, userId: adam.id  }] : []),
  ];
  await db.insert(householdMembers).values(memberRows);

  await db.update(users)
    .set({ householdId: household.id, householdEnabled: true, savingsEnabled: true, onboardingComplete: true })
    .where(eq(users.id, userId));

  const subMemberIds = [lucia?.id, tomas?.id, adam?.id].filter(Boolean) as string[];
  if (subMemberIds.length > 0) {
    await db.update(users)
      .set({ householdId: household.id, householdEnabled: true })
      .where(inArray(users.id, subMemberIds));
  }

  // ── 6. Build transactions ─────────────────────────────────────────────────
  type TxRow = {
    userId: string; categoryId: string; type: "expense" | "income";
    amount: string; description: string; date: string; isFixed: boolean;
    householdId: number; createdBy: string;
  };

  const P = userId;
  const L = lucia?.id ?? userId;
  const T = tomas?.id ?? userId;
  const A = adam?.id  ?? userId;

  const tx = (
    cat: string, type: "expense" | "income", amount: string,
    desc: string, date: string, isFixed = false, createdBy = userId
  ): TxRow => ({ userId, categoryId: cid(cat), type, amount, description: desc, date, isFixed, householdId: household.id, createdBy });

  const isFuture = (m: { year: number; month: number }, day: number) =>
    m.year === todayYear && m.month === todayMonth && day > todayDay;

  // Fixed expenses — all by Demo (P)
  const fixedRows: TxRow[] = [];
  for (const m of MONTHS) {
    for (const f of FIXED_DEFS) {
      if (isFuture(m, f.day)) continue;
      fixedRows.push(tx(f.cat, "expense", f.amount, f.desc, d(m.year, m.month, f.day), true, P));
    }
  }

  // Variable expenses — 5 per member per month, spread across different days
  const variableRows: TxRow[] = [];
  for (const m of MONTHS) {
    const mk = (cat: string, amount: string, desc: string, day: number, by: string) =>
      isFuture(m, day) ? null : tx(cat, "expense", amount, desc, d(m.year, m.month, day), false, by);
    const rows = [
      // Demo (P)
      mk("Potraviny",   "42.30", "Kaufland",              3,  P),
      mk("Tankovanie",  "58.00", "Shell",                 5,  P),
      mk("Reštaurácie", "38.50", "Reštaurácia",          13,  P),
      mk("Zdravie",     "28.60", "Lekáreň",              19,  P),
      mk("Zábava",      "18.00", "Kino",                 23,  P),
      // Demo 1 (L)
      mk("Potraviny",   "35.80", "Billa",                 4,  L),
      mk("Drogéria",    "24.80", "dm",                    8,  L),
      mk("Tankovanie",  "54.20", "OMV",                  16,  L),
      mk("Oblečenie",   "69.00", "Zara",                 20,  L),
      mk("Reštaurácie", "42.00", "Freshmarket",          25,  L),
      // Demo 2 (T)
      mk("Potraviny",   "48.60", "Tesco",                 6,  T),
      mk("Oblečenie",   "45.00", "Deichmann",            11,  T),
      mk("Reštaurácie", "38.50", "Sushiville",           17,  T),
      mk("Drogéria",    "19.40", "Rossmann",             21,  T),
      mk("Zábava",      "22.00", "Escape Room",          24,  T),
      // Demo 3 (A)
      mk("Potraviny",   "39.90", "Lidl",                  7,  A),
      mk("Tankovanie",  "56.80", "BP",                   12,  A),
      mk("Káva",        "9.40",  "Caffe Nero",           15,  A),
      mk("Zdravie",     "21.80", "Lekáreň Benu",         18,  A),
      mk("Reštaurácie", "31.50", "Pizzeria Marco",       22,  A),
    ].filter(Boolean) as TxRow[];
    variableRows.push(...rows);
  }

  // Income — distributed across members
  const incomeRows: TxRow[] = [];
  for (const m of MONTHS) {
    if (!isFuture(m, 1)) {
      // One recurring series per member. All rows live under the demo user, so
      // a shared "Výplata" label made the four salaries one series and every
      // view picked a different one of them (dashboard 1600 € vs household
      // 1530 €). A missing helper account gets no salary instead of a duplicate.
      incomeRows.push(tx("Plat", "income", "1250", "Výplata", d(m.year, m.month, 1), true, P));
      if (lucia) incomeRows.push(tx("Plat", "income", "980", "Výplata (Demo 1)", d(m.year, m.month, 1), true, L));
      if (tomas) incomeRows.push(tx("Plat", "income", "850", "Výplata (Demo 2)", d(m.year, m.month, 1), true, T));
      if (adam)  incomeRows.push(tx("Plat", "income", "920", "Výplata (Demo 3)", d(m.year, m.month, 1), true, A));
    }
    if (!isFuture(m, 15)) {
      incomeRows.push(tx("Freelance", "income", "400",  "Freelance", d(m.year, m.month, 15), false, P));
      incomeRows.push(tx("Brigáda",   "income", "280",  "Brigáda",   d(m.year, m.month, 15), false, T));
    }
  }

  await db.insert(transactions).values([...fixedRows, ...variableRows, ...incomeRows]);

  // ── 7. Savings goals ──────────────────────────────────────────────────────
  const deadline = (addMonths: number) => {
    const dt = new Date(now.getFullYear(), now.getMonth() + addMonths, now.getDate());
    return d(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
  };

  await db.insert(savingsGoals).values([
    {
      userId,
      name: "Dovolenka Chorvátsko",
      targetAmount: "1500",
      savedAmount:  "800",
      deadline: deadline(3),
      icon:  "🏖️",
      color: "#06B6D4",
      note:  "Letná dovolenka pri mori",
    },
    {
      userId,
      name: "Nové auto",
      targetAmount: "5000",
      savedAmount:  "1200",
      deadline: deadline(18),
      icon:  "🚗",
      color: "#F59E0B",
      note:  "Záloha na nové auto",
    },
    {
      userId,
      name: "Rezervný fond",
      targetAmount: "3000",
      savedAmount:  "2100",
      deadline: deadline(6),
      icon:  "🏦",
      color: "#10B981",
      note:  "Núdzová rezerva na 3 mesiace",
    },
  ]);

  console.log(`[demo-reset] Reset complete for userId=${userId.slice(0, 8)}… household=${household.id}`);
}

export { DEMO_EMAIL };
