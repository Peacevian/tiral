"use client"

import Link from "next/link"
import { NO_LADDER_PROGRESS, TIERS, gigLockedText, ladderSteps, tierSavings, type LadderGig, type LadderStep } from "@tiral/game-core"
import { usePlayer } from "@/lib/player"
import { formatCoins } from "@/lib/useCoins"

// The hustle ladder as a career path: the gigs you've opened, the next one
// with how far you are, and the rest (greyed) with what they pay, so there's
// always something to work towards.

const GIG_INFO: Record<LadderGig, { icon: string; name: string; pay: string }> = {
  porter: { icon: "🧺", name: "Kikuubo porter", pay: "2,000–5,500 a load" },
  carwash: { icon: "🚗", name: "Car wash", pay: "8,000–15,000 a car" },
  boda: { icon: "🛵", name: "Boda passengers", pay: "4,000–9,500 a trip" },
  rolex: { icon: "🍳", name: "Rolex stand", pay: "about 1,000 profit a rolex" },
  live: { icon: "📱", name: "Sell clothes on live", pay: "the best pay in town" }
}

/** Where the work towards each gig is done (the step below it), and the button that goes there. */
const EARNED_AT: Record<LadderGig, LadderGig> = { porter: "porter", carwash: "porter", boda: "porter", rolex: "boda", live: "rolex" }
const GO_TEXT: Record<LadderGig, string> = {
  porter: "🧺 Carry loads in Kikuubo",
  carwash: "🚗 Wash cars",
  boda: "🛵 Carry boda passengers",
  rolex: "🍳 Open your rolex stand",
  live: "📱 Sell on live"
}

/** The ladder for the signed-in player (everything closed but the porter while loading). */
export function useLadder(): { steps: LadderStep[]; next: LadderStep | null; tiktokLinked: boolean; balance: number } {
  const { player } = usePlayer()
  const steps = ladderSteps(player?.ladder ?? NO_LADDER_PROGRESS)
  return {
    steps,
    next: steps.find((step) => !step.unlocked) ?? null,
    tiktokLinked: player?.user.tiktokLinked === true,
    balance: player?.balance ?? 0
  }
}

// Everyone is in the first tier until moving up arrives with the first small
// business (docs/career-roadmap.md, Phase 3a).
const CURRENT_TIER = TIERS[0]!

/**
 * One line for the collapsed row: the next gig to open ("Next: Car wash ·
 * 2 / 5 porter loads"), or once the street jobs are all open, the savings
 * towards the next tier.
 */
export function nextUnlockText(next: LadderStep | null, balance: number): string {
  if (next?.progress && !next.comingSoon) {
    return `Next: ${GIG_INFO[next.gig].name} · ${next.progress.have} / ${next.progress.need} ${next.progress.label}`
  }
  const savings = tierSavings(CURRENT_TIER.id, balance)
  return savings ? `Next: ${savings.tier.name} · ${formatCoins(savings.have)} / ${formatCoins(savings.need)} saved` : "Every hustle is open"
}

/** Under the street jobs: the next tier, and how far your savings are towards it. */
function NextTier({ balance }: { balance: number }) {
  const savings = tierSavings(CURRENT_TIER.id, balance)
  if (!savings) return null
  return (
    <div className="mx-2 mb-2 rounded-xl border border-sheet-line bg-sheet p-3">
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-sheet-mute">Next tier</div>
      <div className="mt-0.5 text-sm font-black text-sheet-ink">🏪 {savings.tier.name}</div>
      <div className="text-xs text-sheet-mute">{savings.tier.blurb}</div>
      <div
        role="progressbar"
        aria-label={`Saved ${formatCoins(savings.have)} of ${formatCoins(savings.need)}`}
        aria-valuemin={0}
        aria-valuemax={savings.need}
        aria-valuenow={savings.have}
        className="mt-2 h-2 overflow-hidden rounded-full bg-sheet-line"
      >
        <div className="h-full rounded-full bg-sheet-blue" style={{ width: `${Math.round(savings.share * 100)}%` }} />
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="font-mono font-bold text-sheet-blue">
          {formatCoins(savings.have)} / {formatCoins(savings.need)}
        </span>
        <span className="text-sheet-mute">{savings.ready ? "Saved! Moving up opens soon" : "saved"}</span>
      </div>
      <Link href="/leaderboard?board=rich" className="mt-2 inline-flex min-h-[44px] items-center text-xs font-bold text-flame-deep">
        💰 See the Kampala Rich List ›
      </Link>
    </div>
  )
}

function Progress({ step }: { step: LadderStep }) {
  if (!step.progress) return null
  const share = Math.round((step.progress.have / step.progress.need) * 100)
  return (
    <span className="mt-1 block">
      <span
        role="progressbar"
        aria-label={`${step.progress.have} of ${step.progress.need} ${step.progress.label}`}
        aria-valuemin={0}
        aria-valuemax={step.progress.need}
        aria-valuenow={step.progress.have}
        className="block h-1.5 overflow-hidden rounded-full bg-sheet-line"
      >
        <span className="block h-full rounded-full bg-flame" style={{ width: `${share}%` }} />
      </span>
      <span className="mt-0.5 block text-[11px] font-bold text-flame-deep">
        {step.progress.have} / {step.progress.need} {step.progress.label}
      </span>
    </span>
  )
}

export function HustleLadder() {
  const { steps, next, tiktokLinked, balance } = useLadder()
  return (
    <div>
      <div className="px-4 pb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-flame-deep">
        Tier 1 · {CURRENT_TIER.name}
    </div>
    <ol className="flex flex-col gap-1 px-2 pb-2" aria-label="Your hustle path">
      {steps.map((step) => {
        const info = GIG_INFO[step.gig]
        const isNext = step === next
        if (step.unlocked && !step.comingSoon) {
          return (
            <li key={step.gig}>
              <Link href={`/hustle?gig=${step.gig}`} className="flex min-h-[52px] items-center gap-3 rounded-lg px-2 transition hover:bg-sheet-soft">
                <span aria-hidden className="w-6 text-center text-lg">
                  {info.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-sheet-ink">{info.name}</span>
                  <span className="block truncate text-xs text-sheet-mute">{info.pay}</span>
                </span>
                <span className="text-sm font-bold text-flame-deep">Work</span>
              </Link>
            </li>
          )
        }
        return (
          <li
            key={step.gig}
            className={`flex min-h-[52px] items-center gap-3 rounded-lg px-2 py-1.5 ${isNext ? "border border-flame/40 bg-flame-soft" : "opacity-60"}`}
          >
            <span aria-hidden className="w-6 text-center text-lg grayscale-[40%]">
              {step.unlocked ? info.icon : "🔒"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-sheet-ink">
                {info.name}
                {step.comingSoon && <span className="ml-1.5 text-[11px] font-bold text-sheet-blue">coming soon</span>}
              </span>
              <span className="block truncate text-xs text-sheet-mute">
                {info.pay}
                {step.needsTikTok && !tiktokLinked && " · needs TikTok connected"}
              </span>
              {isNext && <Progress step={step} />}
            </span>
          </li>
        )
      })}
    </ol>
    <NextTier balance={balance} />
    </div>
  )
}

/** Is this gig still closed for the signed-in player? (False while loading: the server has the final say.) */
export function useGigLocked(gig: string): boolean {
  const { player } = usePlayer()
  if (!player) return false
  return gigLockedText(gig, player.ladder ?? NO_LADDER_PROGRESS) !== null
}

/** On a gig's start card while it's still closed: what's left, and where to earn it. */
export function LockedGig({ gig }: { gig: LadderGig }) {
  const { player } = usePlayer()
  const { steps } = useLadder()
  const step = steps.find((candidate) => candidate.gig === gig)
  const text = player ? gigLockedText(gig, player.ladder ?? NO_LADDER_PROGRESS) : null
  if (!step || !text) return null
  return (
    <div className="mt-3 rounded-xl border border-flame/40 bg-flame-soft p-3">
      <p className="text-sm font-black text-sheet-ink">🔒 Not open to you yet</p>
      <p className="mt-0.5 text-xs text-sheet-ink">{text}</p>
      <Progress step={step} />
      {/* A full load: the hustle page reads ?gig= once, so a client-side hop to the same page wouldn't switch gigs. */}
      <a
        href={`/hustle?gig=${EARNED_AT[gig]}`}
        className="mt-2 inline-flex min-h-[44px] items-center rounded-xl bg-flame px-3 text-sm font-black text-white"
      >
        {GO_TEXT[EARNED_AT[gig]]}
      </a>
    </div>
  )
}
