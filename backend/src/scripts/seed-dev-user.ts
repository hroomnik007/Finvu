/**
 * Local development user: a regular, e-mail-verified account with sample data,
 * so the app can be tried (by hand or with Playwright) without SMTP.
 *
 * LOCAL ONLY. Refuses to run when NODE_ENV=production or when DATABASE_URL does
 * not point at localhost / 127.0.0.1. The check runs before the db module (and
 * therefore any connection) is loaded.
 *
 * It is an ordinary account: no demo flag, no household, no reset-on-login.
 */
import dotenv from "dotenv";

dotenv.config();

const DEV_EMAIL = "dev@finvu.local";
const DEV_PASSWORD = "DevPass123!";
const DEV_NAME = "Dev User";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

function refuse(reason: string): never {
  console.error(`[seed-dev-user] Refusing to run: ${reason}`);
  process.exit(1);
}

function assertLocalOnly(): void {
  if (process.env.NODE_ENV === "production") {
    refuse("NODE_ENV=production.");
  }
  const raw = process.env.DATABASE_URL;
  if (!raw) refuse("DATABASE_URL is not set.");
  let host: string;
  try {
    host = new URL(raw).hostname;
  } catch {
    return refuse("DATABASE_URL is not a valid URL.");
  }
  if (!LOCAL_HOSTS.has(host)) {
    refuse(`DATABASE_URL host "${host}" is not localhost or 127.0.0.1.`);
  }
}

function d(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const CATS = [
  { name: "Potraviny",   type: "expense" as const, color: "#10B981", icon: "🛒", budgetLimit: "400" },
  { name: "Reštaurácie", type: "expense" as const, color: "#F97316", icon: "🍽️", budgetLimit: "150" },
  { name: "Tankovanie",  type: "expense" as const, color: "#F59E0B", icon: "⛽", budgetLimit: "120" },
  { name: "Zábava",      type: "expense" as const, color: "#8B5CF6", icon: "🎉", budgetLimit: "80"  },
  { name: "Bývanie",     type: "expense" as const, color: "#3B82F6", icon: "🏠", budgetLimit: null  },
  { name: "Plat",        type: "income"  as const, color: "#34D399", icon: "💰", budgetLimit: null  },
  { name: "Freelance",   type: "income"  as const, color: "#3B82F6", icon: "💻", budgetLimit: null  },
];

async function main(): Promise<void> {
  assertLocalOnly();

  // Loaded only after the guard: these import the env config and open the pool.
  const [{ default: bcrypt }, { eq }, { db }, schema] = await Promise.all([
    import("bcrypt"),
    import("drizzle-orm"),
    import("../db"),
    import("../db/schema"),
  ]);
  const { users, categories, transactions } = schema;

  console.log("=== Seeding local dev user ===");

  // ── 1. User (verified e-mail, regular account) ───────────────────────────
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);
  let [user] = await db.select().from(users).where(eq(users.email, DEV_EMAIL)).limit(1);
  if (user) {
    [user] = await db.update(users)
      .set({ passwordHash, name: DEV_NAME, emailVerified: true, isDeactivated: false, onboardingComplete: true })
      .where(eq(users.id, user.id))
      .returning();
  } else {
    [user] = await db.insert(users).values({
      email: DEV_EMAIL,
      passwordHash,
      name: DEV_NAME,
      emailVerified: true,
      role: "user",
      onboardingComplete: true,
    }).returning();
  }
  const userId = user.id;

  // ── 2. Clean slate for this user only ────────────────────────────────────
  await db.delete(transactions).where(eq(transactions.userId, userId));
  await db.delete(categories).where(eq(categories.userId, userId));

  // ── 3. Categories ────────────────────────────────────────────────────────
  const inserted = await db.insert(categories).values(
    CATS.map(c => ({
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
  const catId = new Map(inserted.map(c => [c.name, c.id]));
  const cid = (name: string): string => {
    const id = catId.get(name);
    if (!id) throw new Error(`Category not found: ${name}`);
    return id;
  };

  // ── 4. Transactions: last 3 months, nothing dated in the future ──────────
  const now = new Date();
  const today = d(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const rows: Array<typeof transactions.$inferInsert> = [];
  const add = (
    cat: string, type: "expense" | "income", amount: string, description: string,
    date: string, isFixed = false,
  ): void => {
    if (date > today) return;
    rows.push({ userId, categoryId: cid(cat), type, amount, description, date, isFixed, createdBy: userId });
  };

  for (let i = 2; i >= 0; i--) {
    const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = m.getFullYear();
    const mo = m.getMonth() + 1;
    // One fixed expense and one recurring income
    add("Bývanie", "expense", "650", JSON.stringify({ l: "Nájom", n: "", d: 1 }), d(y, mo, 1), true);
    add("Plat", "income", "1500", "Výplata", d(y, mo, 1), true);
    // A few ordinary transactions
    add("Potraviny",   "expense", "42.30", "Kaufland", d(y, mo, 3));
    add("Tankovanie",  "expense", "58.00", "Shell",    d(y, mo, 5));
    add("Reštaurácie", "expense", "38.50", "Reštaurácia", d(y, mo, 13));
    add("Zábava",      "expense", "18.00", "Kino",     d(y, mo, 23));
    add("Freelance",   "income",  "300",   "Freelance", d(y, mo, 15));
  }
  await db.insert(transactions).values(rows);

  console.log(`Created ${inserted.length} categories and ${rows.length} transactions.`);
  console.log(`=== Done: ${DEV_EMAIL} ===`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
