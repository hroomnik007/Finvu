import { Pool } from "pg";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import dotenv from "dotenv";
dotenv.config();

// Builds the legacy part of the schema (backend/drizzle/*.sql, frozen) on an EMPTY
// database. Everything newer lives in backend/migrations and is applied by
// `npm run db:migrate`; `npm run db:setup` runs both in order. Production already has
// all of this, so this script refuses to touch a database that has a users table.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Some of the old files re-add objects an earlier file created: those are harmless
const HARMLESS = new Set(["42701", "42P07", "42710"]); // duplicate column / table / object

async function run() {
  const existing = await pool.query("SELECT to_regclass('public.users') AS t");
  if (existing.rows[0].t) {
    console.log("[baseline] users table exists, skipping (this script is for empty databases).");
    await pool.end();
    return;
  }

  const dir = join(__dirname, "../../drizzle");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const statements = readFileSync(join(dir, file), "utf-8").split("--> statement-breakpoint");
    for (const statement of statements) {
      if (!statement.trim()) continue;
      try {
        await pool.query(statement);
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (!code || !HARMLESS.has(code)) throw err;
      }
    }
    console.log(`[baseline] Applied: ${file}`);
  }
  await pool.end();
}

run().catch((err) => {
  console.error("[baseline] Error:", err);
  process.exit(1);
});
