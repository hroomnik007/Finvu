import bcrypt from "bcrypt";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  users,
  categories,
  transactions,
  savingsGoals,
  households,
  householdMembers,
  notificationsDismissed,
} from "../db/schema";

const DEMO_EMAIL  = "demo@finvu.sk";
const DEMO1_EMAIL = "lucia@finvu.sk";
const DEMO2_EMAIL = "tomas@finvu.sk";
const DEMO3_EMAIL = "adam@finvu.sk";
const DEMO_PASSWORD = "demo123";

function d(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Hardcoded to March–May 2026 as per spec
const MONTHS = [
  { year: 2026, month: 3 },
  { year: 2026, month: 4 },
  { year: 2026, month: 5 },
];
const TODAY_DAY   = 25; // 2026-05-25
const TODAY_MONTH = 5;
const TODAY_YEAR  = 2026;

// ── Categories ───────────────────────────────────────────────────────────────
type CatDef = { name: string; type: "expense" | "income"; color: string; icon: string; budgetLimit: string | null };

const EXPENSE_CATS: CatDef[] = [
  // Variable categories (with budget limits)
  { name: "Potraviny",         type: "expense", color: "#10B981", icon: "🛒", budgetLimit: "400"  },
  { name: "Reštaurácie",       type: "expense", color: "#F97316", icon: "🍽️", budgetLimit: "150"  },
  { name: "Tankovanie",        type: "expense", color: "#F59E0B", icon: "⛽", budgetLimit: "120"  },
  { name: "Oblečenie",         type: "expense", color: "#EC4899", icon: "👗", budgetLimit: "100"  },
  { name: "Zábava",            type: "expense", color: "#8B5CF6", icon: "🎉", budgetLimit: "80"   },
  { name: "Zdravie",           type: "expense", color: "#EF4444", icon: "💊", budgetLimit: "60"   },
  { name: "Drogéria",          type: "expense", color: "#06B6D4", icon: "🧴", budgetLimit: "50"   },
  { name: "Káva",              type: "expense", color: "#92400E", icon: "☕", budgetLimit: "40"   },
  // Fixed-expense categories (no limits) — each has its own icon
  { name: "Bývanie",           type: "expense", color: "#3B82F6", icon: "🏠", budgetLimit: null   },
  { name: "Energie",           type: "expense", color: "#FBBF24", icon: "⚡", budgetLimit: null   },
  { name: "Telekomunikácie",   type: "expense", color: "#A78BFA", icon: "📡", budgetLimit: null   },
  { name: "Netflix",           type: "expense", color: "#E50914", icon: "🎬", budgetLimit: null   },
  { name: "Spotify",           type: "expense", color: "#1DB954", icon: "🎵", budgetLimit: null   },
  { name: "Poistenie auta",    type: "expense", color: "#F59E0B", icon: "🚗", budgetLimit: null   },
  { name: "Životné poistenie", type: "expense", color: "#6366F1", icon: "🛡️", budgetLimit: null   },
];

const INCOME_CATS: CatDef[] = [
  { name: "Plat",      type: "income", color: "#34D399", icon: "💰", budgetLimit: null },
  { name: "Freelance", type: "income", color: "#3B82F6", icon: "💻", budgetLimit: null },
  { name: "Brigáda",   type: "income", color: "#A3E635", icon: "💼", budgetLimit: null },
];

// ── Fixed expense definitions ────────────────────────────────────────────────
const FIXED_DEFS = [
  { desc: "Nájom",               cat: "Bývanie",           amount: "650",  day: 1  },
  { desc: "Elektrina",           cat: "Energie",           amount: "45",   day: 14 },
  { desc: "Internet",            cat: "Telekomunikácie",   amount: "25",   day: 20 },
  { desc: "Netflix",             cat: "Netflix",           amount: "18",   day: 8  },
  { desc: "Spotify",             cat: "Spotify",           amount: "10",   day: 8  },
  { desc: "Poistenie auta",      cat: "Poistenie auta",    amount: "58",   day: 15 },
  { desc: "Životné poistenie",   cat: "Životné poistenie", amount: "35",   day: 15 },
];

async function getOrCreateUser(email: string, name: string): Promise<typeof users.$inferSelect> {
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    await db.update(users).set({ name }).where(eq(users.id, existing.id));
    return { ...existing, name };
  }
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const [created] = await db.insert(users).values({
    email,
    passwordHash,
    name,
    emailVerified: true,
    role: "user",
    onboardingComplete: true,
  }).returning();
  return created;
}

async function main() {
  console.log("=== Seeding demo account ===");

  // ── 1. Create/get users ──────────────────────────────────────────────────
  const peter = await getOrCreateUser(DEMO_EMAIL,  "Demo");
  const lucia = await getOrCreateUser(DEMO1_EMAIL, "Demo 1");
  const tomas = await getOrCreateUser(DEMO2_EMAIL, "Demo 2");
  const adam  = await getOrCreateUser(DEMO3_EMAIL, "Demo 3");
  console.log(`Users: Demo(${peter.id.slice(0,8)}…) Demo 1(${lucia.id.slice(0,8)}…) Demo 2(${tomas.id.slice(0,8)}…) Demo 3(${adam.id.slice(0,8)}…)`);

  // ── 2. Clean slate for demo user ────────────────────────────────────────
  await db.delete(notificationsDismissed).where(eq(notificationsDismissed.userId, peter.id));
  await db.delete(transactions).where(eq(transactions.userId, peter.id));
  await db.delete(savingsGoals).where(eq(savingsGoals.userId, peter.id));
  await db.delete(categories).where(eq(categories.userId, peter.id));
  console.log("Cleared old data for demo user.");

  // ── 3. Clear existing household ──────────────────────────────────────────
  const [demoUser] = await db.select({ householdId: users.householdId })
    .from(users).where(eq(users.id, peter.id)).limit(1);
  if (demoUser?.householdId) {
    const hid = demoUser.householdId;
    await db.delete(householdMembers).where(eq(householdMembers.householdId, hid));
    await db.delete(households).where(eq(households.id, hid));
    await db.update(users)
      .set({ householdId: null, householdEnabled: false })
      .where(inArray(users.id, [peter.id, lucia.id, tomas.id, adam.id]));
    console.log(`Deleted old household ${hid}.`);
  }

  // ── 4. Create categories ─────────────────────────────────────────────────
  const allCatDefs = [...EXPENSE_CATS, ...INCOME_CATS];
  const insertedCats = await db.insert(categories).values(
    allCatDefs.map(c => ({
      userId: peter.id,
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
  const cid = (name: string): string => {
    const id = catMap.get(name);
    if (!id) throw new Error(`Category not found: ${name}`);
    return id;
  };
  console.log(`Created ${insertedCats.length} categories.`);

  // ── 5. Create household ──────────────────────────────────────────────────
  const [household] = await db.insert(households).values({
    name: "Demových",
    inviteCode: "DEMO2026",
    createdBy: peter.id,
  }).returning();

  await db.insert(householdMembers).values([
    { householdId: household.id, userId: peter.id },
    { householdId: household.id, userId: lucia.id },
    { householdId: household.id, userId: tomas.id },
    { householdId: household.id, userId: adam.id  },
  ]);
  await db.update(users)
    .set({ householdId: household.id, householdEnabled: true, savingsEnabled: true, onboardingComplete: true })
    .where(eq(users.id, peter.id));
  await db.update(users)
    .set({ householdId: household.id, householdEnabled: true })
    .where(inArray(users.id, [lucia.id, tomas.id, adam.id]));
  console.log(`Created household "${household.name}" (id=${household.id}).`);

  const hid = household.id;

  type TxRow = {
    userId: string; categoryId: string; type: "expense" | "income";
    amount: string; description: string; date: string; isFixed: boolean;
    householdId: number; createdBy: string;
  };

  const tx = (
    cat: string, type: "expense" | "income", amount: string,
    desc: string, date: string, isFixed = false, createdBy = peter.id
  ): TxRow => ({ userId: peter.id, categoryId: cid(cat), type, amount, description: desc, date, isFixed, householdId: hid, createdBy });

  const skipFuture = (month: number, day: number) =>
    month === TODAY_MONTH && day > TODAY_DAY;

  // ── 6. Fixed expenses (one template per expense) ─────────────────────────
  const fixedRows: TxRow[] = FIXED_DEFS.map(f =>
    tx(f.cat, "expense", f.amount, JSON.stringify({ l: f.desc, n: "", d: f.day }), d(TODAY_YEAR, TODAY_MONTH, f.day), true)
  );
  console.log(`Built ${fixedRows.length} fixed expense rows.`);

  // ── 7. Variable expenses ─────────────────────────────────────────────────
  const P = peter.id, L = lucia.id, T = tomas.id, A = adam.id;

  // March — 20 transactions (5 per member)
  const march: TxRow[] = [
    // Demo (P) — 5
    tx("Potraviny",   "expense", "42.30", "Lidl",               d(2026,3,3),  false, P),
    tx("Tankovanie",  "expense", "58.00", "Shell",              d(2026,3,5),  false, P),
    tx("Potraviny",   "expense", "65.20", "Kaufland",           d(2026,3,10), false, P),
    tx("Reštaurácie", "expense", "35.00", "Reštaurácia U Zlatého", d(2026,3,14), false, P),
    tx("Zábava",      "expense", "18.00", "Kino Palace",        d(2026,3,26), false, P),
    // Demo 1 (L) — 5
    tx("Potraviny",   "expense", "31.50", "Billa",              d(2026,3,6),  false, L),
    tx("Drogéria",    "expense", "24.80", "dm",                 d(2026,3,8),  false, L),
    tx("Tankovanie",  "expense", "52.40", "OMV",                d(2026,3,16), false, L),
    tx("Zdravie",     "expense", "28.60", "Lekáreň Dr.Max",     d(2026,3,18), false, L),
    tx("Oblečenie",   "expense", "79.00", "Zara",               d(2026,3,22), false, L),
    // Demo 2 (T) — 5
    tx("Potraviny",   "expense", "45.80", "Tesco",              d(2026,3,4),  false, T),
    tx("Oblečenie",   "expense", "45.00", "Deichmann",          d(2026,3,11), false, T),
    tx("Reštaurácie", "expense", "42.50", "Sushiville",         d(2026,3,17), false, T),
    tx("Drogéria",    "expense", "19.40", "Rossmann",           d(2026,3,23), false, T),
    tx("Zábava",      "expense", "22.00", "Escape Room",        d(2026,3,29), false, T),
    // Demo 3 (A) — 5
    tx("Potraviny",   "expense", "38.90", "Billa",              d(2026,3,7),  false, A),
    tx("Tankovanie",  "expense", "54.60", "BP",                 d(2026,3,12), false, A),
    tx("Reštaurácie", "expense", "29.50", "Pizzeria Marco",     d(2026,3,19), false, A),
    tx("Káva",        "expense", "9.40",  "Caffe Nero",         d(2026,3,24), false, A),
    tx("Zdravie",     "expense", "21.80", "Lekáreň Benu",       d(2026,3,27), false, A),
  ];

  // April — 22 transactions (~5-6 per member)
  const april: TxRow[] = [
    // Demo (P) — 6
    tx("Potraviny",   "expense", "55.80", "Lidl",               d(2026,4,2),  false, P),
    tx("Tankovanie",  "expense", "62.00", "Shell",              d(2026,4,3),  false, P),
    tx("Reštaurácie", "expense", "48.00", "Bratislavský pivovar", d(2026,4,12), false, P),
    tx("Tankovanie",  "expense", "55.80", "OMV",                d(2026,4,14), false, P),
    tx("Potraviny",   "expense", "82.60", "Tesco",              d(2026,4,19), false, P),
    tx("Zábava",      "expense", "22.00", "IMAX",               d(2026,4,25), false, P),
    // Demo 1 (L) — 6
    tx("Potraviny",   "expense", "47.30", "Kaufland",           d(2026,4,5),  false, L),
    tx("Drogéria",    "expense", "31.20", "dm",                 d(2026,4,7),  false, L),
    tx("Káva",        "expense", "11.40", "Starbucks",          d(2026,4,11), false, L),
    tx("Oblečenie",   "expense", "69.99", "Deichmann",          d(2026,4,16), false, L),
    tx("Káva",        "expense", "9.60",  "Double Tree Caffe",  d(2026,4,21), false, L),
    tx("Oblečenie",   "expense", "89.00", "Zara",               d(2026,4,23), false, L),
    // Demo 2 (T) — 5
    tx("Potraviny",   "expense", "38.60", "Billa",              d(2026,4,4),  false, T),
    tx("Zdravie",     "expense", "15.40", "Lekáreň Benu",       d(2026,4,9),  false, T),
    tx("Oblečenie",   "expense", "55.00", "CCC",                d(2026,4,17), false, T),
    tx("Drogéria",    "expense", "22.50", "Rossmann",           d(2026,4,24), false, T),
    tx("Reštaurácie", "expense", "34.80", "Freshmarket",        d(2026,4,29), false, T),
    // Demo 3 (A) — 5
    tx("Potraviny",   "expense", "52.10", "Kaufland",           d(2026,4,6),  false, A),
    tx("Káva",        "expense", "8.80",  "Costa Coffee",       d(2026,4,10), false, A),
    tx("Zdravie",     "expense", "18.50", "Lekáreň Dr.Max",     d(2026,4,15), false, A),
    tx("Oblečenie",   "expense", "49.99", "H&M",                d(2026,4,22), false, A),
    tx("Tankovanie",  "expense", "61.40", "OMV",                d(2026,4,28), false, A),
  ];

  // May — 20 transactions (all ≤ day 25, ~5 per member)
  const mayRows: TxRow[] = [
    // Demo (P) — 5
    tx("Potraviny",   "expense", "61.40", "Kaufland",           d(2026,5,2),  false, P),
    tx("Tankovanie",  "expense", "59.50", "Shell",              d(2026,5,5),  false, P),
    tx("Reštaurácie", "expense", "55.00", "Pho Saigon",         d(2026,5,11), false, P),
    tx("Zdravie",     "expense", "32.10", "Lekáreň Benu",       d(2026,5,19), false, P),
    tx("Zábava",      "expense", "20.00", "Cinemax",            d(2026,5,24), false, P),
    // Demo 1 (L) — 5
    tx("Drogéria",    "expense", "18.90", "dm",                 d(2026,5,7),  false, L),
    tx("Potraviny",   "expense", "44.20", "Billa",              d(2026,5,9),  false, L),
    tx("Oblečenie",   "expense", "42.99", "Deichmann",          d(2026,5,17), false, L),
    tx("Oblečenie",   "expense", "95.00", "Zara",               d(2026,5,23), false, L),
    tx("Reštaurácie", "expense", "41.30", "Freshmarket",        d(2026,5,25), false, L),
    // Demo 2 (T) — 5
    tx("Potraviny",   "expense", "71.80", "Tesco",              d(2026,5,4),  false, T),
    tx("Tankovanie",  "expense", "63.20", "OMV",                d(2026,5,8),  false, T),
    tx("Drogéria",    "expense", "16.50", "Rossmann",           d(2026,5,13), false, T),
    tx("Reštaurácie", "expense", "38.40", "Kebab Slávia",       d(2026,5,20), false, T),
    tx("Zábava",      "expense", "15.00", "Bowling centrum",    d(2026,5,22), false, T),
    // Demo 3 (A) — 5
    tx("Potraviny",   "expense", "49.60", "Lidl",               d(2026,5,3),  false, A),
    tx("Káva",        "expense", "14.20", "Starbucks",          d(2026,5,10), false, A),
    tx("Tankovanie",  "expense", "57.80", "Shell",              d(2026,5,14), false, A),
    tx("Zdravie",     "expense", "25.90", "Lekáreň Dr.Max",     d(2026,5,21), false, A),
    tx("Potraviny",   "expense", "36.70", "Billa",              d(2026,5,23), false, A),
  ].filter(r => !skipFuture(5, parseInt(r.date.slice(8))));

  const variableRows = [...march, ...april, ...mayRows];
  console.log(`Built ${variableRows.length} variable expense rows.`);

  // ── 8. Income ────────────────────────────────────────────────────────────
  const incomeRows: TxRow[] = [];

  // March
  incomeRows.push(tx("Plat",     "income", "1250", "Výplata",  d(2026,3,1),  true,  P));
  incomeRows.push(tx("Freelance","income", "350",  "Freelance",d(2026,3,20), false, P));
  incomeRows.push(tx("Plat",     "income", "980",  "Výplata (Demo 1)",  d(2026,3,1),  true,  L));
  incomeRows.push(tx("Plat",     "income", "850",  "Výplata (Demo 2)",  d(2026,3,1),  true,  T));
  incomeRows.push(tx("Brigáda",  "income", "250",  "Brigáda",  d(2026,3,15), false, T));
  incomeRows.push(tx("Plat",     "income", "920",  "Výplata (Demo 3)",  d(2026,3,1),  true,  A));

  // April
  incomeRows.push(tx("Plat",     "income", "1300", "Výplata",  d(2026,4,1),  true,  P));
  incomeRows.push(tx("Freelance","income", "450",  "Freelance",d(2026,4,15), false, P));
  incomeRows.push(tx("Plat",     "income", "1050", "Výplata (Demo 1)",  d(2026,4,1),  true,  L));
  incomeRows.push(tx("Plat",     "income", "850",  "Výplata (Demo 2)",  d(2026,4,1),  true,  T));
  incomeRows.push(tx("Plat",     "income", "950",  "Výplata (Demo 3)",  d(2026,4,1),  true,  A));
  incomeRows.push(tx("Freelance","income", "180",  "Freelance",d(2026,4,20), false, A));

  // May (all ≤ day 25)
  incomeRows.push(tx("Plat",     "income", "1200", "Výplata",  d(2026,5,1),  true,  P));
  incomeRows.push(tx("Plat",     "income", "1000", "Výplata (Demo 1)",  d(2026,5,1),  true,  L));
  incomeRows.push(tx("Plat",     "income", "850",  "Výplata (Demo 2)",  d(2026,5,1),  true,  T));
  incomeRows.push(tx("Brigáda",  "income", "300",  "Brigáda",  d(2026,5,10), false, T));
  incomeRows.push(tx("Plat",     "income", "950",  "Výplata (Demo 3)",  d(2026,5,1),  true,  A));

  console.log(`Built ${incomeRows.length} income rows.`);

  // ── 9. Insert all transactions ───────────────────────────────────────────
  const allTx = [...fixedRows, ...variableRows, ...incomeRows];
  await db.insert(transactions).values(allTx);
  console.log(`Inserted ${allTx.length} transactions total (${fixedRows.length} fixed, ${variableRows.length} variable, ${incomeRows.length} income).`);

  // ── 10. Savings goals ────────────────────────────────────────────────────
  await db.insert(savingsGoals).values([
    {
      userId: peter.id,
      name: "Dovolenka Chorvátsko",
      targetAmount: "1500",
      savedAmount:  "800",
      deadline: "2026-08-31",
      icon:  "🏖️",
      color: "#06B6D4",
      note:  "Letná dovolenka pri mori",
    },
    {
      userId: peter.id,
      name: "Nové auto",
      targetAmount: "5000",
      savedAmount:  "1200",
      deadline: "2027-06-30",
      icon:  "🚗",
      color: "#F59E0B",
      note:  "Záloha na nové auto",
    },
    {
      userId: peter.id,
      name: "Rezervný fond",
      targetAmount: "3000",
      savedAmount:  "2100",
      deadline: "2026-12-31",
      icon:  "🏦",
      color: "#10B981",
      note:  "Núdzová rezerva na 3 mesiace",
    },
  ]);
  console.log("Created 3 savings goals.");

  console.log("=== Demo seed complete ===");
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
