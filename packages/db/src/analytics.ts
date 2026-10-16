import { sql, type SQL } from "drizzle-orm"
import { kampalaDay, kampalaDayStart, shiftDay } from "@tiral/game-core"
import { getDatabase, type Database } from "./client.js"

// Admin statistics (docs/analytics-plan.md, phase A): computed live from the
// tables the game already writes — users, races, the coin ledger, life
// events, bikes, billboards — plus user_activity_days. Every "day" is a
// Kampala day (UTC+3), the same one the game's daily caps use, so the
// dashboard and the rules agree. Nothing here is cached: at today's volume
// (thousands of rows) each query is a few milliseconds on the indexes added
// in migration 0014.

export type DayCount = { day: string; count: number }
export type RetentionCell = { eligible: number; retained: number }
export type RetentionRow = { week: string; size: number; d1: RetentionCell; d7: RetentionCell; d30: RetentionCell }
export type RaceDay = { day: string; races: number; players: number; finishers: number }
export type HustleDay = { day: string; gig: string; jobs: number; net: number }
export type HustleGig = { gig: string; jobs: number; net: number }
export type EconomyDay = { day: string; minted: number; burned: number }
export type ReasonTotal = { reason: string; entries: number; total: number }
export type LifeCount = { kind: string; status: string; count: number }
export type StatusCount = { status: string; count: number }
export type CampaignStats = {
  id: string
  brandName: string
  status: string
  amountUgx: number
  startsAt: string
  endsAt: string
  impressions: number
  viewers: number
}

export type AdminStats = {
  generatedAt: string
  /** Today as a Kampala day. */
  today: string
  /** Length of the by-day window; totals are all-time unless named otherwise. */
  days: number
  /** First day of the window. */
  since: string
  users: {
    total: number
    linked: number
    guests: number
    newToday: number
    new7d: number
    new30d: number
    /** Distinct players with an activity day today / in the last 7 / 30 days. */
    dau: number
    wau: number
    mau: number
    /** DAU ÷ MAU, or null before anyone was active. */
    stickiness: number | null
    signupsByDay: DayCount[]
    activeByDay: DayCount[]
    /** Sign-up cohorts by week (last 10 weeks). */
    retention: RetentionRow[]
  }
  races: {
    total: number
    last7d: number
    byDay: RaceDay[]
    /** Over the window: mean field size, finishers ÷ starters. */
    avgField: number | null
    finishRate: number | null
  }
  hustles: {
    byGig: HustleGig[]
    byDay: HustleDay[]
  }
  economy: {
    /** All BNG in circulation: the sum of every ledger row. */
    supply: number
    byDay: EconomyDay[]
    byReason: ReasonTotal[]
    balances: { players: number; median: number | null; under1k: number }
    /** Life events in the window by kind and status (rent_paid, evicted, family kinds, shocks, kcca_raid). */
    life: LifeCount[]
    bikes: StatusCount[]
  }
  ads: {
    campaigns: CampaignStats[]
    /** UGX from campaigns that went live (status active, or disabled after going live). */
    revenueUgx: number
  }
}

/** A timestamptz column as its Kampala calendar day. Column names are our own constants, never input. */
function kday(column: string): SQL {
  return sql.raw(`((${column} at time zone 'UTC') + interval '3 hours')::date`)
}

async function rows<T extends Record<string, unknown>>(db: Database, query: SQL): Promise<T[]> {
  return [...(await db.execute(query))] as unknown as T[]
}

/** A moment as a bound timestamptz: raw queries need the ISO text, not a Date object. */
function ts(moment: Date): SQL {
  return sql`${moment.toISOString()}::timestamptz`
}

/** Counts and sums come back as numbers or (for bigint) strings: one shape for the API. */
function num(value: unknown): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

export async function getAdminStats(
  input: { days?: number; now?: Date } = {},
  db: Database = getDatabase()
): Promise<AdminStats> {
  const now = input.now ?? new Date()
  const days = Math.min(365, Math.max(1, Math.floor(input.days ?? 30)))
  const today = kampalaDay(now)
  const sinceDay = shiftDay(today, -(days - 1))
  const since = kampalaDayStart(sinceDay)
  const todayStart = kampalaDayStart(today)
  const d7Start = kampalaDayStart(shiftDay(today, -6))
  const d30Start = kampalaDayStart(shiftDay(today, -29))
  const retentionSince = kampalaDayStart(shiftDay(today, -70))

  const [
    userTotals,
    active,
    signupsByDay,
    activeByDay,
    retention,
    raceTotals,
    raceDays,
    hustleDays,
    economyDays,
    byReason,
    balances,
    life,
    bikes,
    campaigns
  ] = await Promise.all([
    rows<{ total: number; linked: number; new_today: number; new_7d: number; new_30d: number }>(
      db,
      sql`
        select count(*)::int as total,
               count(t.user_id)::int as linked,
               count(*) filter (where u.created_at >= ${ts(todayStart)})::int as new_today,
               count(*) filter (where u.created_at >= ${ts(d7Start)})::int as new_7d,
               count(*) filter (where u.created_at >= ${ts(d30Start)})::int as new_30d
        from users u
        left join tiktok_accounts t on t.user_id = u.id`
    ),
    rows<{ dau: number; wau: number; mau: number }>(
      db,
      sql`
        select count(distinct user_id) filter (where day = ${today}::date)::int as dau,
               count(distinct user_id) filter (where day > ${today}::date - 7)::int as wau,
               count(distinct user_id)::int as mau
        from user_activity_days
        where day > ${today}::date - 30`
    ),
    rows<{ day: string; count: number }>(
      db,
      sql`
        select ${kday("created_at")}::text as day, count(*)::int as count
        from users
        where created_at >= ${ts(since)}
        group by 1 order by 1`
    ),
    rows<{ day: string; count: number }>(
      db,
      sql`
        select day::text as day, count(*)::int as count
        from user_activity_days
        where day >= ${sinceDay}::date
        group by day order by day`
    ),
    rows<{
      week: string
      size: number
      eligible1: number
      retained1: number
      eligible7: number
      retained7: number
      eligible30: number
      retained30: number
    }>(
      db,
      sql`
        with cohort as (
          select id as user_id, ${kday("created_at")} as day0
          from users
          where created_at >= ${ts(retentionSince)}
        )
        select to_char(date_trunc('week', day0), 'YYYY-MM-DD') as week,
               count(*)::int as size,
               count(*) filter (where day0 + 1 < ${today}::date)::int as eligible1,
               count(*) filter (where day0 + 1 < ${today}::date and exists (
                 select 1 from user_activity_days a where a.user_id = c.user_id and a.day = c.day0 + 1))::int as retained1,
               count(*) filter (where day0 + 7 < ${today}::date)::int as eligible7,
               count(*) filter (where day0 + 7 < ${today}::date and exists (
                 select 1 from user_activity_days a where a.user_id = c.user_id and a.day = c.day0 + 7))::int as retained7,
               count(*) filter (where day0 + 30 < ${today}::date)::int as eligible30,
               count(*) filter (where day0 + 30 < ${today}::date and exists (
                 select 1 from user_activity_days a where a.user_id = c.user_id and a.day = c.day0 + 30))::int as retained30
        from cohort c
        group by 1 order by 1`
    ),
    rows<{ total: number; last_7d: number }>(
      db,
      sql`
        select count(*)::int as total,
               count(*) filter (where finished_at >= ${ts(d7Start)})::int as last_7d
        from races`
    ),
    rows<{ day: string; races: number; players: number; finishers: number }>(
      db,
      sql`
        select ${kday("r.finished_at")}::text as day,
               count(*)::int as races,
               coalesce(sum(r.player_count), 0)::int as players,
               coalesce(sum(f.n), 0)::int as finishers
        from races r
        left join (select race_id, count(*) as n from race_results group by race_id) f on f.race_id = r.id
        where r.finished_at >= ${ts(since)}
        group by 1 order by 1`
    ),
    rows<{ day: string; gig: string; jobs: number; net: string }>(
      db,
      sql`
        select ${kday("created_at")}::text as day,
               substr(reason, 8) as gig,
               count(*)::int as jobs,
               sum(delta)::bigint as net
        from coin_ledger
        where reason like 'hustle\\_%' and created_at >= ${ts(since)}
        group by 1, 2 order by 1, 2`
    ),
    rows<{ day: string; minted: string; burned: string }>(
      db,
      sql`
        select ${kday("created_at")}::text as day,
               coalesce(sum(delta) filter (where delta > 0), 0)::bigint as minted,
               coalesce(-sum(delta) filter (where delta < 0), 0)::bigint as burned
        from coin_ledger
        where created_at >= ${ts(since)}
        group by 1 order by 1`
    ),
    rows<{ reason: string; entries: number; total: string }>(
      db,
      sql`
        select reason, count(*)::int as entries, sum(delta)::bigint as total
        from coin_ledger
        where created_at >= ${ts(since)}
        group by reason
        order by abs(sum(delta)) desc, reason`
    ),
    rows<{ players: number; supply: string; median: number | null; under_1k: number }>(
      db,
      sql`
        with b as (select user_id, sum(delta) as bal from coin_ledger group by user_id)
        select count(*)::int as players,
               coalesce(sum(bal), 0)::bigint as supply,
               percentile_cont(0.5) within group (order by bal)::float8 as median,
               count(*) filter (where bal < 1000)::int as under_1k
        from b`
    ),
    rows<{ kind: string; status: string; count: number }>(
      db,
      sql`
        select kind, status, count(*)::int as count
        from life_events
        where created_at >= ${ts(since)}
        group by 1, 2 order by 1, 2`
    ),
    rows<{ status: string; count: number }>(db, sql`select status, count(*)::int as count from bikes group by status order by status`),
    rows<{
      id: string
      brand_name: string
      status: string
      amount_ugx: number
      starts_at: Date
      ends_at: Date
      impressions: number
      viewers: string
    }>(
      db,
      sql`
        select c.id, c.brand_name, c.status, c.amount_ugx, c.starts_at, c.ends_at,
               coalesce(i.n, 0)::int as impressions,
               coalesce(i.viewers, 0)::bigint as viewers
        from billboard_campaigns c
        left join (
          select campaign_id, count(*) as n, sum(viewer_count) as viewers
          from billboard_impressions group by campaign_id
        ) i on i.campaign_id = c.id
        order by c.created_at desc
        limit 50`
    )
  ])

  const totals = userTotals[0]
  const act = active[0]
  const total = num(totals?.total)
  const linked = num(totals?.linked)
  const dau = num(act?.dau)
  const mau = num(act?.mau)

  const raceWindow = raceDays.reduce(
    (acc, row) => ({ races: acc.races + num(row.races), players: acc.players + num(row.players), finishers: acc.finishers + num(row.finishers) }),
    { races: 0, players: 0, finishers: 0 }
  )

  const gigs = new Map<string, HustleGig>()
  for (const row of hustleDays) {
    const gig = gigs.get(row.gig) ?? { gig: row.gig, jobs: 0, net: 0 }
    gig.jobs += num(row.jobs)
    gig.net += num(row.net)
    gigs.set(row.gig, gig)
  }

  const bal = balances[0]
  const campaignList: CampaignStats[] = campaigns.map((row) => ({
    id: row.id,
    brandName: row.brand_name,
    status: row.status,
    amountUgx: num(row.amount_ugx),
    startsAt: new Date(row.starts_at).toISOString(),
    endsAt: new Date(row.ends_at).toISOString(),
    impressions: num(row.impressions),
    viewers: num(row.viewers)
  }))

  return {
    generatedAt: now.toISOString(),
    today,
    days,
    since: sinceDay,
    users: {
      total,
      linked,
      guests: total - linked,
      newToday: num(totals?.new_today),
      new7d: num(totals?.new_7d),
      new30d: num(totals?.new_30d),
      dau,
      wau: num(act?.wau),
      mau,
      stickiness: mau > 0 ? dau / mau : null,
      signupsByDay: signupsByDay.map((row) => ({ day: row.day, count: num(row.count) })),
      activeByDay: activeByDay.map((row) => ({ day: row.day, count: num(row.count) })),
      retention: retention.map((row) => ({
        week: row.week,
        size: num(row.size),
        d1: { eligible: num(row.eligible1), retained: num(row.retained1) },
        d7: { eligible: num(row.eligible7), retained: num(row.retained7) },
        d30: { eligible: num(row.eligible30), retained: num(row.retained30) }
      }))
    },
    races: {
      total: num(raceTotals[0]?.total),
      last7d: num(raceTotals[0]?.last_7d),
      byDay: raceDays.map((row) => ({
        day: row.day,
        races: num(row.races),
        players: num(row.players),
        finishers: num(row.finishers)
      })),
      avgField: raceWindow.races > 0 ? raceWindow.players / raceWindow.races : null,
      finishRate: raceWindow.players > 0 ? raceWindow.finishers / raceWindow.players : null
    },
    hustles: {
      byGig: [...gigs.values()].sort((a, b) => b.jobs - a.jobs),
      byDay: hustleDays.map((row) => ({ day: row.day, gig: row.gig, jobs: num(row.jobs), net: num(row.net) }))
    },
    economy: {
      supply: num(bal?.supply),
      byDay: economyDays.map((row) => ({ day: row.day, minted: num(row.minted), burned: num(row.burned) })),
      byReason: byReason.map((row) => ({ reason: row.reason, entries: num(row.entries), total: num(row.total) })),
      balances: {
        players: num(bal?.players),
        median: bal?.median === null || bal?.median === undefined ? null : num(bal.median),
        under1k: num(bal?.under_1k)
      },
      life: life.map((row) => ({ kind: row.kind, status: row.status, count: num(row.count) })),
      bikes: bikes.map((row) => ({ status: row.status, count: num(row.count) }))
    },
    ads: {
      campaigns: campaignList,
      revenueUgx: campaignList
        .filter((campaign) => campaign.status === "active" || campaign.status === "disabled")
        .reduce((sum, campaign) => sum + campaign.amountUgx, 0)
    }
  }
}
