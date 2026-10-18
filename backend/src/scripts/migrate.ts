import { Pool } from "pg";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import dotenv from "dotenv";
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const migrationsDir = join(__dirname, "../../migrations");
  if (!existsSync(migrationsDir)) {
    console.log("[migrate] No migrations directory found, skipping.");
    await pool.end();
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const applied = await pool.query<{ name: string }>("SELECT name FROM _migrations ORDER BY name");
  const appliedNames = new Set(applied.rows.map((r) => r.name));

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (appliedNames.has(file)) {
      console.log(`[migrate] Already applied: ${file}`);
      continue;
    }
    const sql = readFileSync(join(migrationsDir, file), "utf-8");
    console.log(`[migrate] Applying: ${file}`);
    // One transaction per file: a failure part-way leaves nothing half-applied
    // and the file is not recorded, so the next run retries it cleanly.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO _migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    console.log(`[migrate] Done: ${file}`);
  }

  await pool.end();
  console.log("[migrate] All migrations applied.");
}

run().catch((err) => {
  console.error("[migrate] Error:", err);
  process.exit(1);
});
