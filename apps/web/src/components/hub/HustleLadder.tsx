"use client"

import { useState } from "react"
import Link from "next/link"
import {
  NO_LADDER_PROGRESS,
  STARTING_FOLLOWERS,
  TIERS,
  findBale,
  findTierById,
  gigLockedText,
  ladderSteps,
  tierSavings,
  type LadderGig,
  type LadderStep,
  type TierId
} from "@tiral/game-core"
import { usePlayer } from "@/lib/player"
import { formatCoins } from "@/lib/useCoins"
import { ActionButton } from "@/components/ui"
import { Modal } from "@/components/ui/Modal"

// The hustle ladder as a career path: the gigs you've opened, the next one
// with how far you are, and the rest (greyed) with what they pay, so there's
// always something to work towards.

const GIG_INFO: Record<LadderGig, { icon: string; name: string; pay: string }> = {
  // Per hour of steady work, so every step up reads as a raise (§18.1).
  porter: { icon: "🧺", name: "Kikuubo porter", pay: "about 110,000 an hour" },
  carwash: { icon: "🚗", name: "Car wash", pay: "about 220,000 an hour" },
  boda: { icon: "🛵", name: "Boda passengers", pay: "about 280,000 an hour" },
  rolex: { icon: "🍳", name: "Rolex stand", pay: "about 350,000 an hour" },
  live: { icon: "📱", name: "LivTok mitumba", pay: "about 900,000 an hour" }
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
export function useLadder(): { steps: LadderStep[]; next: LadderStep | null; tiktokLinked: boolean; balance: number; tier: TierId } {
  const { player } = usePlayer()
  const steps = ladderSteps(player?.ladder ?? NO_LADDER_PROGRESS)
  return {
    steps,
    next: steps.find((step) => !step.unlocked) ?? null,
    tiktokLinked: player?.user.tiktokLinked === true,
    balance: player?.balance ?? 0,
    tier: player?.career?.tier ?? "street"
  }
}

/** Ready to move up to Small business: LivTok's experience, TikTok, and the savings. */
function canMoveUp(input: { tier: TierId; liveStep: LadderStep | undefined; tiktokLinked: boolean; balance: number }) {
  return input.tier === "street" && input.liveStep?.unlocked === true && input.tiktokLinked && input.balance >= findTierById("small").capital
}

/**
 * One line for the collapsed row: the next gig to open ("Next: Car wash ·
 * 2 / 5 porter loads"), or once the street jobs are all open, the savings
 * towards the next tier.
 */
export function nextUnlockText(next: LadderStep | null, balance: number, tier: TierId = "street"): string {
  if (next?.progress && !next.comingSoon) {
    return `Next: ${GIG_INFO[next.gig].name} · ${next.progress.have} / ${next.progress.need} ${next.progress.label}`
  }
  const savings = tierSavings(tier, balance)
  return savings ? `Next: ${savings.tier.name} · ${formatCoins(savings.have)} / ${formatCoins(savings.need)} saved` : "Every hustle is open"
}

/** Under the street jobs: the next tier, and how far your savings are towards it. */
function NextTier({ balance, tier }: { balance: number; tier: TierId }) {
  const savings = tierSavings(tier, balance)
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
        <span className="text-sheet-mute">{savings.ready && savings.tier.id !== "small" ? "Saved! Moving up opens soon" : "saved"}</span>
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
  const { steps, next, tiktokLinked, balance, tier } = useLadder()
  // Kept up here: once you move up, LivTok's row turns into "Go live" and would take the dialog with it.
  const [movingUp, setMovingUp] = useState(false)
  const tierIndex = Math.max(0, TIERS.findIndex((candidate) => candidate.id === tier))
  const liveStep = steps.find((step) => step.gig === "live")
  return (
    <div>
      <div className="px-4 pb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-flame-deep">
        Tier {tierIndex + 1} · {TIERS[tierIndex]!.name}
      </div>
      <ol className="flex flex-col gap-1 px-2 pb-2" aria-label="Your hustle path">
        {steps.map((step) => {
          const info = GIG_INFO[step.gig]
          const isNext = step === next
          // LivTok is a small business: open once you've moved up.
          const open = step.unlocked && !step.comingSoon && (step.gig !== "live" || tier !== "street")
          if (open) {
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
                  <span className="text-sm font-bold text-flame-deep">{step.gig === "live" ? "Go live" : "Work"}</span>
                </Link>
              </li>
            )
          }
          if (step.gig === "live" && step.unlocked) {
            return (
              <li key={step.gig} className="rounded-lg border border-flame/40 bg-flame-soft px-2 py-2">
                <MoveUpRow liveStep={liveStep} tiktokLinked={tiktokLinked} balance={balance} tier={tier} onMoveUp={() => setMovingUp(true)} />
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
      <NextTier balance={balance} tier={tier} />
      {movingUp && <MoveUpDialog onClose={() => setMovingUp(false)} />}
    </div>
  )
}

/** LivTok's row once you've done your rolex shifts: what's left to move up, or the Move up button. */
function MoveUpRow({
  liveStep,
  tiktokLinked,
  balance,
  tier,
  onMoveUp
}: {
  liveStep: LadderStep | undefined
  tiktokLinked: boolean
  balance: number
  tier: TierId
  onMoveUp(): void
}) {
  const small = findTierById("small")
  const ready = canMoveUp({ tier, liveStep, tiktokLinked, balance })
  return (
    <div className="flex items-start gap-3">
      <span aria-hidden className="w-6 pt-0.5 text-center text-lg">
        📱
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-sheet-ink">LivTok mitumba</div>
        <div className="text-xs text-sheet-mute">Move up to Small business to sell clothes on live.</div>
        <ul className="mt-1 text-xs">
          <li className="text-leaf">✓ 5 rolex shifts done</li>
          <li className={tiktokLinked ? "text-leaf" : "font-bold text-flame-deep"}>
            {tiktokLinked ? "✓ TikTok connected" : "✗ Connect TikTok (account menu, top right)"}
          </li>
          <li className={balance >= small.capital ? "text-leaf" : "font-bold text-flame-deep"}>
            {balance >= small.capital ? "✓" : "✗"} {formatCoins(Math.min(balance, small.capital))} / {formatCoins(small.capital)} saved
          </li>
        </ul>
        {ready && (
          <ActionButton variant="flame" className="mt-2 w-full" onClick={onMoveUp}>
            🏪 Move up to Small business
          </ActionButton>
        )}
      </div>
    </div>
  )
}

function MoveUpDialog({ onClose }: { onClose(): void }) {
  const { refresh } = usePlayer()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const small = findTierById("small")
  const bale = findBale("tops")!
  const moveUp = async () => {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch("/api/career/move-up", { method: "POST" })
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        setError(body.error ?? "Couldn't move up. Try again.")
        return
      }
      await refresh()
      setDone(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      label="Move up to Small business"
      onClose={onClose}
      portal
      backdropClassName="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center"
      className="w-full max-w-sm rounded-3xl border border-sheet-line bg-sheet p-5 text-sheet-ink shadow-2xl"
    >
      {done ? (
        <>
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-flame-deep">Tier 2 · Small business</div>
          <h2 className="mt-1 text-xl font-black">🎉 You&apos;re a business owner!</h2>
          <p className="mt-2 text-sm text-sheet-mute">
            Your {bale.name.toLowerCase()} bale is in stock and you start with {STARTING_FOLLOWERS} followers. Go live and sell.
          </p>
          <a href="/hustle?gig=live" className="mt-4 flex min-h-[48px] items-center justify-center rounded-xl bg-flame text-sm font-black text-white">
            📱 Open LivTok
          </a>
        </>
      ) : (
        <>
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-flame-deep">Move up</div>
          <h2 className="mt-1 text-xl font-black">🏪 Small business</h2>
          <p className="mt-2 text-sm text-sheet-mute">
            Put <span className="font-mono font-bold text-sheet-blue">{formatCoins(small.invest)}</span> of your savings into your
            first bale from Owino: {bale.icon} {bale.name}, {bale.pieces} pieces. Then sell them on LivTok.
          </p>
          <p className="mt-2 text-xs text-sheet-mute">You start with {STARTING_FOLLOWERS} followers. Good lives bring more.</p>
          {error && (
            <p role="alert" className="mt-2 text-xs font-bold text-flame-deep">
              {error}
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <ActionButton variant="sheet-outline" className="flex-1" onClick={onClose}>
              Not yet
            </ActionButton>
            <ActionButton variant="flame" className="flex-[2]" disabled={busy} onClick={() => void moveUp()}>
              {busy ? "Moving up…" : `Move up · ${formatCoins(small.invest)}`}
            </ActionButton>
          </div>
        </>
      )}
    </Modal>
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
