import { and, desc, eq, gte, sql } from "drizzle-orm"
import { getDatabase, type Database } from "./client.js"
import { raceResults, races, users } from "./schema.js"

export type RecordedPlacement = {
  userId: string | null
  position: number
  finishedAt: Date
}

export async function recordRaceResults(
  input: {
    roomCode: string
    destinationId: string
    startedAt: Date
    finishedAt: Date
    playerCount: number
    placements: RecordedPlacement[]
  },
  db: Database = getDatabase()
): Promise<string> {
  return db.transaction(async (tx) => {
    const created = await tx
      .insert(races)
      .values({
        roomCode: input.roomCode,
        destinationId: input.destinationId,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
        playerCount: input.playerCount
      })
      .returning({ id: races.id })
    const race = created[0]
    if (!race) throw new Error("Failed to record race")
    if (input.placements.length > 0) {
      await tx.insert(raceResults).values(
        input.placements.map((placement) => ({
          raceId: race.id,
          userId: placement.userId,
          position: placement.position,
          finishedAt: placement.finishedAt
        }))
      )
    }
    return race.id
  })
}

export type LeaderboardEntry = {
  userId: string
  displayName: string
  avatarUrl: string | null
  points: number
  wins: number
  podiums: number
  races: number
}

export async function getLeaderboard(
  since: Date | null,
  /** Top N only: the table grows with every race; nobody scrolls past 100. */
  limit = 100,
  db: Database = getDatabase()
): Promise<LeaderboardEntry[]> {
  const conditions = [
    sql`${raceResults.userId} IS NOT NULL`,
    ...(since ? [gte(raceResults.finishedAt, since)] : [])
  ]
  const rows = await db
    .select({
      userId: raceResults.userId,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      points: sql<number>`sum(case ${raceResults.position} when 1 then 3 when 2 then 2 when 3 then 1 else 0 end)`,
      wins: sql<number>`sum(case when ${raceResults.position} = 1 then 1 else 0 end)`,
      podiums: sql<number>`sum(case when ${raceResults.position} <= 3 then 1 else 0 end)`,
      races: sql<number>`count(*)`
    })
    .from(raceResults)
    .innerJoin(users, eq(users.id, raceResults.userId))
    .where(and(...conditions))
    .groupBy(raceResults.userId, users.displayName, users.avatarUrl)
    .orderBy(desc(sql`sum(case ${raceResults.position} when 1 then 3 when 2 then 2 when 3 then 1 else 0 end)`), desc(sql`sum(case when ${raceResults.position} = 1 then 1 else 0 end)`))
    .limit(limit)

  return rows.map((row) => ({
    userId: row.userId as string,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    points: Number(row.points),
    wins: Number(row.wins),
    podiums: Number(row.podiums),
    races: Number(row.races)
  }))
}
