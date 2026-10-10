import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema.js"

export type Database = PostgresJsDatabase<typeof schema>

let database: Database | null = null

export function getDatabase(connectionString?: string): Database {
  if (database) return database
  const url = connectionString ?? process.env.DATABASE_URL
  if (!url) {
    throw new Error("DATABASE_URL is not set")
  }
  const client = postgres(url, { max: 5 })
  database = drizzle(client, { schema })
  return database
}
