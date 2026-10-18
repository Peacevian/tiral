import { sql } from "drizzle-orm"
import { getDatabase, type Database } from "./client.js"
import { fleetBikeValueSql } from "./fleet.js"
import { coinLedger, fleetBikes, users } from "./schema.js"

// The Kampala Rich List: players by net worth: coins plus what their
// businesses own (fleet bikes at their worn value). Shops and property join
// it as those businesses arrive (§18).

export type RichListEntry = { userId: string; displayName: string; avatarUrl: string | null; netWorth: number }

/** Each player's net worth, as a SQL common table expression body. */
const worths = sql`
  select coins.user_id, coins.worth + coalesce(fleet.worth, 0) as worth
  from (select user_id, sum(${coinLedger.delta}) as worth from ${coinLedger} group by user_id) coins
  left join (
    select ${fleetBikes.userId} as user_id, sum(${fleetBikeValueSql}) as worth
    from ${fleetBikes} where ${fleetBikes.status} = 'ok' group by ${fleetBikes.userId}
  ) fleet on fleet.user_id = coins.user_id`

/** The richest players, top first. */
export async function getRichList(limit = 100, db: Database = getDatabase()): Promise<RichListEntry[]> {
  const rows = [
    ...(await db.execute(sql`
      with totals as (${worths})
      select totals.user_id, ${users.displayName} as display_name, ${users.avatarUrl} as avatar_url, totals.worth
      from totals join ${users} on ${users.id} = totals.user_id
      order by totals.worth desc, totals.user_id
      limit ${limit}`))
  ] as unknown as Array<{ user_id: string; display_name: string; avatar_url: string | null; worth: string }>
  return rows.map((row) => ({ userId: row.user_id, displayName: row.display_name, avatarUrl: row.avatar_url, netWorth: Math.round(Number(row.worth)) }))
}

/** Where one player stands (1 = richest), and their net worth. */
export async function getRichRank(userId: string, db: Database = getDatabase()): Promise<{ rank: number; netWorth: number }> {
  const [row] = [
    ...(await db.execute(sql`
      with totals as (${worths}),
           mine as (select coalesce((select worth from totals where user_id = ${userId}), 0) as worth)
      select (select count(*) from totals, mine where totals.worth > mine.worth) + 1 as rank,
             (select worth from mine) as net_worth`))
  ] as unknown as Array<{ rank: string; net_worth: string }>
  return { rank: Number(row?.rank ?? 1), netWorth: Math.round(Number(row?.net_worth ?? 0)) }
}
