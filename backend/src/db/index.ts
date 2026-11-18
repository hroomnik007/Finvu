import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import { env } from "../config/env";
import { describeError } from "../lib/safeErrorLog";
import * as schema from "./schema";

// Limits for the application pool only. The one-off scripts (migrate, check-schema,
// baseline, seed-dev-user) open their own pools without these, so a long migration
// is never cut off.
//
// statement_timeout: every application query is per user, indexed and small; the
// heaviest legitimate ones (restore in 1000-row inserts, the merge-mode read of a
// user's transactions, the monthly e-mail summary, nightly cleanup deletes, admin
// counts) take milliseconds on this data. 30 s leaves a margin of several orders of
// magnitude while still stopping a runaway query from holding a connection.
// idle_in_transaction_session_timeout: no transaction awaits anything but the
// database (no e-mail or HTTP call inside db.transaction), so 60 s idle means a bug.
export const POOL_OPTIONS = {
  max: 10,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
  statement_timeout: 30_000,
  idle_in_transaction_session_timeout: 60_000,
} as const satisfies PoolConfig;

export const pool = new Pool({ connectionString: env.DATABASE_URL, ...POOL_OPTIONS });

// An idle client erroring (e.g. Postgres restarting) is emitted on the pool;
// without a listener Node treats it as uncaught and the process exits.
// describeError redacts URLs (a connection string can never reach the log),
// quoted values and e-mail addresses, and truncates the message.
pool.on("error", (err) => {
  console.error(`[db] idle client error: ${describeError(err)}`);
});

export const db = drizzle(pool, { schema });

// One warning line at startup when the application connects as a superuser.
// Never fails the start; if the query itself fails nothing is logged.
export async function warnIfSuperuser(query: (text: string) => Promise<{ rows: { rolsuper?: unknown }[] }> = (t) => pool.query(t)): Promise<void> {
  try {
    const { rows } = await query("SELECT rolsuper FROM pg_roles WHERE rolname = current_user");
    if (rows[0]?.rolsuper === true) {
      console.warn("[db] warning: the application database role is a PostgreSQL superuser; use a non-superuser role that owns the tables");
    }
  } catch {
    // ignore: this is advisory only
  }
}
