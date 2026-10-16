// The hustle ladder: everyone starts as a Kikuubo porter and works up to the
// better-paying gigs. Each step asks for experience (jobs done); the real-life
// needs (bike rent, stock money, a TikTok account) are checked where they're
// paid for. Racing is never gated. See docs/economy-progress.md §17.

/** Only work done from here counts (the ladder started everyone from scratch). */
export const LADDER_START = "2026-10-16T12:19:00Z"

/** Jobs done since LADDER_START, counted from the coin ledger. */
export type LadderCounts = {
  /** Paid porter loads. */
  porter: number
  /** Paid cars washed. */
  carwash: number
  /** Paid boda trips. */
  boda: number
  /** Rolex shifts opened (stock bought). */
  rolexShifts: number
}

export const NO_LADDER_PROGRESS: LadderCounts = { porter: 0, carwash: 0, boda: 0, rolexShifts: 0 }

type Requirement = {
  /** How the count is made from LadderCounts. */
  count(counts: LadderCounts): number
  need: number
  /** "porter loads", for "3 / 5 porter loads"; `one` when a single one is left. */
  label: string
  one: string
}

export type LadderGig = "porter" | "carwash" | "boda" | "rolex" | "live"

export const LADDER: ReadonlyArray<{
  gig: LadderGig
  /** Who unlocks you, for the inbox note ("The bay owner says…"). */
  unlockedBy: string
  unlockText: string
  /** "wash cars", for "Do 3 more porter loads to wash cars." */
  action: string
  requirement: Requirement | null
  /** Needs a connected TikTok account too. */
  tiktok?: boolean
  /** Not built yet: shown on the ladder as coming soon. */
  comingSoon?: boolean
}> = [
  { gig: "porter", unlockedBy: "", unlockText: "", action: "carry loads", requirement: null },
  {
    gig: "carwash",
    unlockedBy: "Nakivubo washing bay",
    unlockText: "The bay owner saw you carry loads all day. You can wash cars now.",
    action: "wash cars",
    requirement: { count: (c) => c.porter, need: 5, label: "porter loads", one: "porter load" }
  },
  {
    gig: "boda",
    unlockedBy: "Stage chairman",
    unlockText: "You know the streets now. Rent a bike and carry passengers from the stage.",
    action: "ride a boda",
    requirement: { count: (c) => c.porter + c.carwash, need: 15, label: "jobs", one: "job" }
  },
  {
    gig: "rolex",
    unlockedBy: "Mama Rose",
    unlockText: "You know where the customers are. Buy some stock and open your own rolex stand.",
    action: "open a rolex stand",
    requirement: { count: (c) => c.boda, need: 20, label: "boda trips", one: "boda trip" }
  },
  {
    gig: "live",
    unlockedBy: "Owino traders",
    unlockText: "You can run a business. Buy a bale at Owino and sell clothes on live.",
    action: "sell clothes on live",
    requirement: { count: (c) => c.rolexShifts, need: 5, label: "rolex shifts", one: "rolex shift" },
    tiktok: true,
    comingSoon: true
  }
]

export type LadderStep = {
  gig: LadderGig
  unlocked: boolean
  comingSoon: boolean
  needsTikTok: boolean
  /** Progress towards unlocking (null for the first step). */
  progress: { have: number; need: number; label: string } | null
}

/** Every step of the ladder for these counts. */
export function ladderSteps(counts: LadderCounts): LadderStep[] {
  return LADDER.map((step) => {
    const have = step.requirement ? Math.min(step.requirement.count(counts), step.requirement.need) : 0
    const done = !step.requirement || step.requirement.count(counts) >= step.requirement.need
    return {
      gig: step.gig,
      unlocked: done,
      comingSoon: step.comingSoon === true,
      needsTikTok: step.tiktok === true,
      progress: step.requirement ? { have, need: step.requirement.need, label: step.requirement.label } : null
    }
  })
}

/** Has the player earned this gig? (Gigs that aren't on the ladder are open.) */
export function isGigUnlocked(gig: string, counts: LadderCounts): boolean {
  const step = LADDER.find((candidate) => candidate.gig === gig)
  if (!step?.requirement) return true
  return step.requirement.count(counts) >= step.requirement.need
}

/** Why a gig is still closed, e.g. "Do 3 more porter loads to wash cars." (null when open). */
export function gigLockedText(gig: string, counts: LadderCounts): string | null {
  const step = LADDER.find((candidate) => candidate.gig === gig)
  if (!step?.requirement) return null
  const left = step.requirement.need - step.requirement.count(counts)
  if (left <= 0) return null
  return `Do ${left} more ${left === 1 ? step.requirement.one : step.requirement.label} to ${step.action}.`
}

export function findLadderStep(gig: string) {
  return LADDER.find((step) => step.gig === gig) ?? null
}
