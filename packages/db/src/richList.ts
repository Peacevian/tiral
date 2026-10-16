import { desc, eq, sql } from "drizzle-orm"
import { getDatabase, type Database } from "./client.js"
import { coinLedger, users } from "./schema.js"

// The Kampala Rich List: players by net worth. For now net worth is coins;
// bikes, shops and property join it as those businesses arrive (§18).

export type RichListEntry = { userId: string; displayName: string; avatarUrl: string | null; netWorth: number }

const worth = sql<string>`sum(${coinLedger.delta})`

/** The richest players, top first. */
export async function getRichList(limit = 100, db: Database = getDatabase()): Promise<RichListEntry[]> {
  const rows = await db
    .select({ userId: coinLedger.userId, displayName: users.displayName, avatarUrl: users.avatarUrl, netWorth: worth })
    .from(coinLedger)
    .innerJoin(users, eq(users.id, coinLedger.userId))
    .groupBy(coinLedger.userId, users.displayName, users.avatarUrl)
    .orderBy(desc(worth), coinLedger.userId)
    .limit(limit)
  return rows.map((row) => ({ ...row, netWorth: Number(row.netWorth) }))
}

/** Where one player stands (1 = richest), and their net worth. */
export async function getRichRank(userId: string, db: Database = getDatabase()): Promise<{ rank: number; netWorth: number }> {
  const [row] = [
    ...(await db.execute(sql`
      with totals as (select user_id, sum(delta) as worth from ${coinLedger} group by user_id),
           mine as (select coalesce((select worth from totals where user_id = ${userId}), 0) as worth)
      select (select count(*) from totals, mine where totals.worth > mine.worth) + 1 as rank,
             (select worth from mine) as net_worth`))
  ] as unknown as Array<{ rank: string; net_worth: string }>
  return { rank: Number(row?.rank ?? 1), netWorth: Number(row?.net_worth ?? 0) }
}
