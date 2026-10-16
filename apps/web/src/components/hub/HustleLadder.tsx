"use client"

import Link from "next/link"
import { NO_LADDER_PROGRESS, gigLockedText, ladderSteps, type LadderGig, type LadderStep } from "@tiral/game-core"
import { usePlayer } from "@/lib/player"

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
export function useLadder(): { steps: LadderStep[]; next: LadderStep | null; tiktokLinked: boolean } {
  const { player } = usePlayer()
  const steps = ladderSteps(player?.ladder ?? NO_LADDER_PROGRESS)
  return { steps, next: steps.find((step) => !step.unlocked) ?? null, tiktokLinked: player?.user.tiktokLinked === true }
}

/** One line for the collapsed row: "Next: Car wash · 2 / 5 porter loads". */
export function nextUnlockText(next: LadderStep | null): string {
  if (!next?.progress) return "Every hustle is open"
  return `Next: ${GIG_INFO[next.gig].name} · ${next.progress.have} / ${next.progress.need} ${next.progress.label}`
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
  const { steps, next, tiktokLinked } = useLadder()
  return (
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
