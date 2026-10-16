// Prize races: a signed-in (TikTok-linked) host puts up a BNG pot for a race
// they schedule. The pot is held from the host's wallet when they set it, and
// paid to the top finishers (never the host) in the shares the host chose,
// minus a 10 % cut that leaves the game. A race that doesn't really happen
// (too few other racers, nobody reaches the treasure, missed start) refunds
// the whole pot with no cut.

export const PRIZE_CUT_SHARE = 0.1
export const PRIZE_MIN_POT = 1_000
export const PRIZE_MAX_WINNERS = 5
/** Smallest share any one winner can get, in percent. */
export const PRIZE_MIN_SHARE_PERCENT = 5
export const PRIZE_MESSAGE_MAX = 60
/** Other people (distinct accounts, not the host) who must race for the prize to pay. */
export const PRIZE_MIN_OTHER_RACERS = 2

const MINUTE = 60_000
/** How far ahead a prize race can be scheduled: time to promote it, not so far it's forgotten. */
export const HOSTED_MIN_LEAD_MS = 15 * MINUTE
export const HOSTED_MAX_LEAD_MS = 7 * 24 * 60 * MINUTE
/** The countdown that runs once the start time is reached. */
export const HOSTED_COUNTDOWN_CHOICES = [30, 60, 120, 300] as const
/** The race room opens (joinable) this long before the start; before that you sign up. */
export const HOSTED_OPEN_BEFORE_MS = 60 * MINUTE
/** Signed-up players get an inbox reminder this long before the start. */
export const HOSTED_REMINDER_BEFORE_MS = 15 * MINUTE
/** A scheduled race whose start passed this long ago with no room is refunded. */
export const HOSTED_MISSED_AFTER_MS = 10 * MINUTE

/** Share presets offered in the host's form (percent per winner, in place order). */
export const PRIZE_SPLIT_PRESETS: ReadonlyArray<{ label: string; shares: readonly number[] }> = [
  { label: "Winner takes all", shares: [100] },
  { label: "70 / 30", shares: [70, 30] },
  { label: "50 / 30 / 20", shares: [50, 30, 20] },
  { label: "40 / 25 / 15 / 12 / 8", shares: [40, 25, 15, 12, 8] }
]

export type PrizeInput = {
  pot: number
  shares: readonly number[]
  message?: string | null
  startsAt: Date
  countdownSeconds: number
}

export type PrizeProblem =
  | "pot_too_small"
  | "pot_not_whole"
  | "winners"
  | "share_too_small"
  | "shares_total"
  | "message_too_long"
  | "too_soon"
  | "too_far"
  | "countdown"

/** What's wrong with a prize race setup, or null if it's fine. */
export function prizeProblem(input: PrizeInput, now: Date): PrizeProblem | null {
  if (!Number.isInteger(input.pot)) return "pot_not_whole"
  if (input.pot < PRIZE_MIN_POT) return "pot_too_small"
  if (input.shares.length < 1 || input.shares.length > PRIZE_MAX_WINNERS) return "winners"
  if (input.shares.some((share) => !Number.isInteger(share) || share < PRIZE_MIN_SHARE_PERCENT)) return "share_too_small"
  if (input.shares.reduce((sum, share) => sum + share, 0) !== 100) return "shares_total"
  if ((input.message ?? "").length > PRIZE_MESSAGE_MAX) return "message_too_long"
  const lead = input.startsAt.getTime() - now.getTime()
  if (!Number.isFinite(lead) || lead < HOSTED_MIN_LEAD_MS) return "too_soon"
  if (lead > HOSTED_MAX_LEAD_MS) return "too_far"
  if (!(HOSTED_COUNTDOWN_CHOICES as readonly number[]).includes(input.countdownSeconds)) return "countdown"
  return null
}

export const PRIZE_PROBLEM_TEXT: Record<PrizeProblem, string> = {
  pot_too_small: `The pot must be at least ${PRIZE_MIN_POT.toLocaleString("en-US")} BNG`,
  pot_not_whole: "The pot must be a whole number of BNG",
  winners: `Pick between 1 and ${PRIZE_MAX_WINNERS} winners`,
  share_too_small: `Each winner needs at least ${PRIZE_MIN_SHARE_PERCENT}%`,
  shares_total: "The shares must add up to 100%",
  message_too_long: `Keep the message under ${PRIZE_MESSAGE_MAX} characters`,
  too_soon: "Start at least 15 minutes from now, so people can join",
  too_far: "Start within the next 7 days",
  countdown: "Pick a countdown"
}

export type PrizeSplit = {
  /** Paid out of the pot, per finishing place that wins (same order as the winners). */
  payouts: number[]
  /** Kept back by the game (10 %, plus rounding). */
  cut: number
  /** Shares nobody finished to claim: back to the host. */
  unclaimed: number
}

/**
 * Split a pot among `winners` finishers (best first). The cut comes off the
 * whole pot; each place gets its share of the rest; places nobody reached go
 * back to the host. Amounts are whole BNG; rounding dust goes to the cut.
 */
export function splitPrize(pot: number, shares: readonly number[], winners: number): PrizeSplit {
  const payable = Math.floor(pot * (1 - PRIZE_CUT_SHARE))
  const perPlace = shares.map((share) => Math.floor((payable * share) / 100))
  const paid = perPlace.slice(0, Math.max(0, Math.min(winners, shares.length)))
  const unclaimed = perPlace.slice(paid.length).reduce((sum, amount) => sum + amount, 0)
  const payouts = paid
  const cut = pot - payouts.reduce((sum, amount) => sum + amount, 0) - unclaimed
  return { payouts, cut, unclaimed }
}
