import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../config/env";
import * as schema from "./schema";

const pool = new Pool({ connectionString: env.DATABASE_URL });

// An idle client erroring (e.g. Postgres restarting) is emitted on the pool;
// without a listener Node treats it as uncaught and the process exits.
pool.on("error", (err) => {
  console.error("[db] idle client error:", err);
});

export const db = drizzle(pool, { schema });
