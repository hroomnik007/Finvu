import { Pool } from "pg";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "../db/schema";
import dotenv from "dotenv";
dotenv.config();

// Compares src/db/schema.ts with the real database: every table and column the code
// knows about must exist. Used by CI on a database built from scratch, so a migration
// that was forgotten (or a column added only in production) is caught before deploy.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const rows = await pool.query<{ table_name: string; column_name: string }>(
    "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'",
  );
  const have = new Map<string, Set<string>>();
  for (const r of rows.rows) {
    if (!have.has(r.table_name)) have.set(r.table_name, new Set());
    have.get(r.table_name)!.add(r.column_name);
  }

  const problems: string[] = [];
  for (const value of Object.values(schema)) {
    if (!(value instanceof PgTable)) continue;
    const { name, columns } = getTableConfig(value);
    const cols = have.get(name);
    if (!cols) {
      problems.push(`missing table ${name}`);
      continue;
    }
    for (const c of columns) if (!cols.has(c.name)) problems.push(`missing column ${name}.${c.name}`);
  }

  await pool.end();
  if (problems.length) {
    console.error("[check-schema] Schema drift:\n  " + problems.join("\n  "));
    process.exit(1);
  }
  console.log("[check-schema] Database matches src/db/schema.ts");
}

run().catch((err) => {
  console.error("[check-schema] Error:", err);
  process.exit(1);
});
