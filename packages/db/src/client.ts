import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema.js"

export type Database = PostgresJsDatabase<typeof schema>

// One pool per process, kept on globalThis: Next's dev server loads this module
// several times (per server bundle, and again on every hot reload), and a
// module-level variable would open a fresh pool each time without closing the
// old one — enough to exhaust the database's connection slots.
const shared = globalThis as typeof globalThis & { __tiralDatabase?: Database }

export function getDatabase(connectionString?: string): Database {
  if (shared.__tiralDatabase) return shared.__tiralDatabase
  const url = connectionString ?? process.env.DATABASE_URL
  if (!url) {
    throw new Error("DATABASE_URL is not set")
  }
  const client = postgres(url, {
    max: 5,
    // Give idle connections back so a quiet process holds none.
    idle_timeout: 30,
    // Recycle long-lived connections (also clears ones a dropped tunnel left dead).
    max_lifetime: 60 * 30
  })
  shared.__tiralDatabase = drizzle(client, { schema })
  return shared.__tiralDatabase
}
