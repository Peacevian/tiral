// Banange Coins (BNG): earned in-game only, never bought with real money,
// priced at street UGX scale (a rolex ≈ 2,000). These are the pure rules;
// @tiral/db applies them to the ledger. See docs/economy-progress.md §13–14.

export const WELCOME_GRANT = 10_000

export const RACE_FINISH_PAY = 1_000
/** Extra pay for 1st/2nd/3rd — only when you actually beat someone. */
export const PODIUM_BONUS: Record<number, number> = { 1: 5_000, 2: 3_000, 3: 1_500 }
export const FIRST_WIN_OF_DAY_BONUS = 2_000
export const STREAK_BONUS_PER_DAY = 500
export const STREAK_BONUS_MAX_DAYS = 7
/** Race earnings stop for the day once this much has been paid (anti-farming). */
export const DAILY_RACE_EARNINGS_CAP = 30_000
/** Solo races pay nothing: you need someone to race against. */
export const MIN_FIELD_FOR_EARNINGS = 2

export const LEDGER_REASONS = [
  "welcome_grant",
  "race_finish",
  "race_podium",
  "first_win_of_day",
  "race_streak"
] as const
export type LedgerReason = (typeof LEDGER_REASONS)[number]

/** Reasons that count towards the daily race cap. */
export const RACE_EARNING_REASONS: readonly LedgerReason[] = [
  "race_finish",
  "race_podium",
  "first_win_of_day",
  "race_streak"
]

// Uganda is UTC+3 all year (no daylight saving).
const KAMPALA_OFFSET_MS = 3 * 60 * 60 * 1000

/** Calendar day in Kampala, as YYYY-MM-DD. */
export function kampalaDay(date: Date): string {
  return new Date(date.getTime() + KAMPALA_OFFSET_MS).toISOString().slice(0, 10)
}

/** The instant a Kampala day starts. */
export function kampalaDayStart(day: string): Date {
  return new Date(Date.parse(`${day}T00:00:00Z`) - KAMPALA_OFFSET_MS)
}

export function shiftDay(day: string, deltaDays: number): string {
  const ms = Date.parse(`${day}T00:00:00Z`) + deltaDays * 24 * 60 * 60 * 1000
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * Consecutive days, ending today, on which the player had a paid finish —
 * counting today (the race being paid now).
 */
export function streakDaysIncludingToday(today: string, earlierFinishDays: Iterable<string>): number {
  const days = new Set(earlierFinishDays)
  let streak = 1
  let day = shiftDay(today, -1)
  while (days.has(day)) {
    streak++
    day = shiftDay(day, -1)
  }
  return streak
}

export type RaceEarningInput = {
  position: number
  /** Players who actually raced (had a start). */
  fieldSize: number
  /** Race earnings already paid today, before this race. */
  earnedToday: number
  /** Already received today's first-win bonus. */
  wonToday: boolean
  /** This is the player's first paid finish today. */
  firstFinishToday: boolean
  /** From streakDaysIncludingToday. */
  streakDays: number
}

export type Earning = { reason: LedgerReason; amount: number }

/** What one finisher earns for one race, already clipped to the daily cap. */
export function computeRaceEarnings(input: RaceEarningInput): Earning[] {
  if (input.fieldSize < MIN_FIELD_FOR_EARNINGS) return []
  const earnings: Earning[] = [{ reason: "race_finish", amount: RACE_FINISH_PAY }]
  const beatSomeone = input.position < input.fieldSize
  const podium = PODIUM_BONUS[input.position]
  if (podium && beatSomeone) earnings.push({ reason: "race_podium", amount: podium })
  if (input.position === 1 && !input.wonToday) {
    earnings.push({ reason: "first_win_of_day", amount: FIRST_WIN_OF_DAY_BONUS })
  }
  if (input.firstFinishToday && input.streakDays >= 2) {
    earnings.push({
      reason: "race_streak",
      amount: STREAK_BONUS_PER_DAY * Math.min(input.streakDays, STREAK_BONUS_MAX_DAYS)
    })
  }

  let room = Math.max(0, DAILY_RACE_EARNINGS_CAP - input.earnedToday)
  const clipped: Earning[] = []
  for (const earning of earnings) {
    const amount = Math.min(earning.amount, room)
    if (amount <= 0) break
    clipped.push({ reason: earning.reason, amount })
    room -= amount
  }
  return clipped
}

export function formatBng(amount: number): string {
  return `${Math.round(amount).toLocaleString("en-US")} BNG`
}
