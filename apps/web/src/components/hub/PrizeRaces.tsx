"use client"

import { useMemo, useState } from "react"
import {
  HOSTED_COUNTDOWN_CHOICES,
  HOSTED_MAX_LEAD_MS,
  HOSTED_MIN_LEAD_MS,
  PRIZE_CUT_SHARE,
  PRIZE_MAX_WINNERS,
  PRIZE_MESSAGE_MAX,
  PRIZE_MIN_POT,
  PRIZE_SPLIT_PRESETS,
  prizeProblem,
  PRIZE_PROBLEM_TEXT,
  splitPrize
} from "@tiral/game-core"
import type { RaceListing } from "@/lib/useColyseus"
import { usePlayer } from "@/lib/player"
import { formatCoins } from "@/lib/useCoins"
import { startLabel, untilLabel, usePrizeRaces, type PrizeRace } from "@/lib/prizeRaces"
import { ShareSheet, raceShareCard, type ShareCard } from "@/components/ShareSheet"
import { ActionButton, ConfirmButton, SectionLabel, actionButtonClass } from "@/components/ui"
import { Modal } from "@/components/ui/Modal"

const PLACE = ["1st", "2nd", "3rd", "4th", "5th"]

/** "50 / 30 / 20" */
const sharesText = (shares: readonly number[]) => (shares.length === 1 ? "winner takes all" : shares.join(" / ") + " %")

/** Prize races in the hub: what's coming up, "I'm in", join when open, and hosting your own. */
export function PrizeRaces({ openRaces, joining, onJoinCode }: { openRaces: RaceListing[]; joining: boolean; onJoinCode(code: string): void }) {
  const { player } = usePlayer()
  const prizes = usePrizeRaces()
  const [hosting, setHosting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [sharing, setSharing] = useState<ShareCard | null>(null)
  const openCodes = new Set(openRaces.filter((race) => race.prize && !race.locked).map((race) => race.roomCode))

  return (
    <div>
      <SectionLabel
        aside={
          <button type="button" onClick={() => setHosting(true)} className="min-h-[44px] rounded-lg px-3 text-xs font-bold text-amber-300">
            🏆 Host one
          </button>
        }
      >
        Prize races ({prizes.races.length})
      </SectionLabel>
      {prizes.races.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/15 px-3 py-3 text-center text-xs text-slate-400">
          {prizes.loading ? "Loading…" : "No prize races yet. Put up a BNG pot and race your friends for it."}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {prizes.races.map((race) => (
            <PrizeRaceCard
              key={race.id}
              race={race}
              isHost={race.host.id === player?.user.id}
              open={openCodes.has(race.roomCode)}
              joining={joining}
              onJoin={() => onJoinCode(race.roomCode)}
              onSignUp={async (on) => setNotice(await prizes.signUp(race.id, on))}
              onCancel={async () => setNotice((await prizes.cancel(race.id)) ?? "Cancelled. The pot is back in your wallet.")}
              onShare={() => setSharing(raceShareCard({ roomCode: race.roomCode, pot: race.pot, host: race.host.name }))}
            />
          ))}
        </ul>
      )}
      {notice && (
        <p role="status" className="mt-2 text-xs font-bold text-cyan-200">
          {notice}
        </p>
      )}
      {sharing && <ShareSheet card={sharing} onClose={() => setSharing(null)} />}
      {hosting && (
        <HostPrizeRace
          onClose={() => setHosting(false)}
          onCreate={async (input) => {
            const result = await prizes.create(input)
            if (result.race) {
              setHosting(false)
              setNotice(`Your race is up: code ${result.race.roomCode}.`)
              // Straight to sharing: that's how people find out about it.
              setSharing(raceShareCard({ roomCode: result.race.roomCode, pot: result.race.pot, host: result.race.host.name }))
            }
            return result.error
          }}
        />
      )}
    </div>
  )
}

function PrizeRaceCard({
  race,
  isHost,
  open,
  joining,
  onJoin,
  onSignUp,
  onCancel,
  onShare
}: {
  race: PrizeRace
  isHost: boolean
  open: boolean
  joining: boolean
  onJoin(): void
  onSignUp(on: boolean): void
  onCancel(): void
  onShare(): void
}) {
  const payable = Math.floor(race.pot * (1 - PRIZE_CUT_SHARE))
  const racing = race.status === "live"
  return (
    <li className="rounded-xl border border-amber-300/30 bg-amber-400/10 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-black text-amber-100">
            🏆 {formatCoins(race.pot)} BNG · {race.shares.length} winner{race.shares.length === 1 ? "" : "s"}
          </div>
          <div className="truncate text-[11px] text-slate-300">
            hosted by <span className="font-bold text-white">{race.host.name}</span> · {sharesText(race.shares)} of{" "}
            {formatCoins(payable)}
          </div>
          {race.message && <div className="mt-0.5 truncate text-xs italic text-slate-200">“{race.message}”</div>}
        </div>
        <span className="shrink-0 font-mono text-xs font-black tracking-[0.15em] text-amber-200">{race.roomCode}</span>
      </div>
      <div className="mt-1 text-[11px] text-slate-300">
        {racing ? (
          <span className="font-bold text-emerald-300">Racing now</span>
        ) : (
          <>
            Starts {startLabel(race.startsAt)} · {untilLabel(race.startsAt)} · {race.signups} in
          </>
        )}
      </div>
      {!racing && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {open ? (
            <ActionButton variant="primary" className="text-xs" disabled={joining} onClick={onJoin}>
              Join race →
            </ActionButton>
          ) : (
            <ActionButton variant={race.signedUp ? "secondary" : "primary"} className="text-xs" onClick={() => onSignUp(!race.signedUp)}>
              {race.signedUp ? "You're in ✓" : "I'm in"}
            </ActionButton>
          )}
          <ActionButton variant="ghost" className="text-xs" onClick={onShare}>
            Share
          </ActionButton>
          {isHost && (
            <ConfirmButton
              className={`${actionButtonClass("danger")} text-xs`}
              armedClassName="!bg-rose-500 !text-white"
              confirmLabel="Tap again: cancel and refund"
              onConfirm={onCancel}
            >
              Cancel race
            </ConfirmButton>
          )}
        </div>
      )}
      {!racing && !open && <p className="mt-1.5 text-[11px] text-slate-400">The room opens 1 hour before the start.</p>}
    </li>
  )
}

/** Local "YYYY-MM-DDTHH:MM" for a datetime-local input. */
function localInput(ms: number) {
  const date = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function HostPrizeRace({ onClose, onCreate }: { onClose(): void; onCreate(input: { pot: number; shares: number[]; message: string; startsAt: string; countdownSeconds: number }): Promise<string | null> }) {
  const { player } = usePlayer()
  const balance = player?.balance ?? 0
  const [pot, setPot] = useState(Math.min(10_000, Math.max(PRIZE_MIN_POT, Math.floor(balance / 1000) * 1000)))
  const [shares, setShares] = useState<number[]>([70, 30])
  const [message, setMessage] = useState("")
  // Default: the next round half hour that's at least an hour away.
  const [startsAt, setStartsAt] = useState(() => localInput(Math.ceil((Date.now() + 60 * 60_000) / (30 * 60_000)) * 30 * 60_000))
  const [countdown, setCountdown] = useState<number>(60)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const linked = player?.user.tiktokLinked === true
  const start = new Date(startsAt)
  const problem = prizeProblem({ pot, shares, message, startsAt: start, countdownSeconds: countdown }, new Date())
  const split = useMemo(() => splitPrize(Math.max(0, pot || 0), shares, shares.length), [pot, shares])
  const short = pot > balance

  const setWinners = (count: number) => {
    const preset = PRIZE_SPLIT_PRESETS.find((candidate) => candidate.shares.length === count)
    setShares(preset ? [...preset.shares] : Array.from({ length: count }, () => Math.floor(100 / count)))
  }

  return (
    <Modal
      label="Host a prize race"
      onClose={onClose}
      portal
      backdropClassName="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center"
      className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-3xl border border-amber-300/30 bg-slate-950 p-5 text-white shadow-2xl"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black">🏆 Host a prize race</h2>
        <button type="button" onClick={onClose} className="min-h-[44px] px-3 text-xs font-bold text-slate-400">
          Close
        </button>
      </div>
      {!linked ? (
        <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200">
          Only players with a connected TikTok account can host prize races (guest coins live on one device).
          <a href="/api/auth/tiktok" className="mt-2 block font-bold text-cyan-300">
            Connect TikTok →
          </a>
        </div>
      ) : (
        <form
          className="mt-3 flex flex-col gap-3"
          onSubmit={async (event) => {
            event.preventDefault()
            if (problem || short) return
            setBusy(true)
            setError(null)
            setError(await onCreate({ pot, shares, message, startsAt: start.toISOString(), countdownSeconds: countdown }))
            setBusy(false)
          }}
        >
          <label className="flex flex-col gap-1 text-xs font-bold text-slate-300">
            Pot (BNG) · you have {formatCoins(balance)}
            <input
              type="number"
              inputMode="numeric"
              min={PRIZE_MIN_POT}
              step={500}
              value={Number.isFinite(pot) ? pot : ""}
              onChange={(event) => setPot(Math.floor(Number(event.target.value)))}
              className="min-h-[44px] rounded-xl border border-white/15 bg-white/5 px-3 font-mono text-base text-white"
            />
          </label>

          <div>
            <div className="mb-1 text-xs font-bold text-slate-300">Winners</div>
            <div className="flex gap-1.5">
              {Array.from({ length: PRIZE_MAX_WINNERS }, (_, index) => index + 1).map((count) => (
                <button
                  key={count}
                  type="button"
                  aria-pressed={shares.length === count}
                  onClick={() => setWinners(count)}
                  className={`min-h-[44px] flex-1 rounded-xl border text-sm font-black ${
                    shares.length === count ? "border-amber-300 bg-amber-300/20 text-amber-100" : "border-white/15 bg-white/5 text-slate-200"
                  }`}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs font-bold text-slate-300">Each winner&apos;s share (%) · must add up to 100</div>
            <div className="flex flex-col gap-1.5">
              {shares.map((share, index) => (
                <label key={index} className="flex items-center gap-2 text-xs text-slate-300">
                  <span className="w-10 font-bold">{PLACE[index]}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={5}
                    max={100}
                    value={share}
                    onChange={(event) => setShares(shares.map((value, i) => (i === index ? Math.floor(Number(event.target.value)) : value)))}
                    className="min-h-[44px] w-20 rounded-xl border border-white/15 bg-white/5 px-2 text-center font-mono text-base text-white"
                    aria-label={`${PLACE[index]} place share in percent`}
                  />
                  <span className="font-mono text-amber-200">{formatCoins(split.payouts[index] ?? 0)} BNG</span>
                </label>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Total {shares.reduce((sum, value) => sum + (value || 0), 0)}% · Tiral keeps {Math.round(PRIZE_CUT_SHARE * 100)}% (
              {formatCoins(split.cut)} BNG). You can&apos;t win your own prize.
            </p>
          </div>

          <label className="flex flex-col gap-1 text-xs font-bold text-slate-300">
            Starts (your time)
            <input
              type="datetime-local"
              value={startsAt}
              min={localInput(Date.now() + HOSTED_MIN_LEAD_MS)}
              max={localInput(Date.now() + HOSTED_MAX_LEAD_MS)}
              onChange={(event) => setStartsAt(event.target.value)}
              className="min-h-[44px] rounded-xl border border-white/15 bg-white/5 px-3 text-base text-white [color-scheme:dark]"
            />
            <span className="font-normal text-slate-400">15 minutes to 7 days from now. People can say &quot;I&apos;m in&quot; until then.</span>
          </label>

          <div>
            <div className="mb-1 text-xs font-bold text-slate-300">Countdown once the start time comes</div>
            <div className="flex gap-1.5">
              {HOSTED_COUNTDOWN_CHOICES.map((seconds) => (
                <button
                  key={seconds}
                  type="button"
                  aria-pressed={countdown === seconds}
                  onClick={() => setCountdown(seconds)}
                  className={`min-h-[44px] flex-1 rounded-xl border text-xs font-black ${
                    countdown === seconds ? "border-amber-300 bg-amber-300/20 text-amber-100" : "border-white/15 bg-white/5 text-slate-200"
                  }`}
                >
                  {seconds < 60 ? `${seconds} s` : `${seconds / 60} min`}
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1 text-xs font-bold text-slate-300">
            Message (optional)
            <input
              value={message}
              maxLength={PRIZE_MESSAGE_MAX}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Kikuubo boda kings 🏆"
              className="min-h-[44px] rounded-xl border border-white/15 bg-white/5 px-3 text-base text-white placeholder:text-slate-500"
            />
          </label>

          <p className="rounded-xl border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
            {formatCoins(pot || 0)} BNG leaves your wallet now and is held until the race on {start.getTime() ? startLabel(start.toISOString()) : "…"}.
            If fewer than 2 other people race, or nobody reaches the treasure, it all comes back.
          </p>
          {(problem || short) && (
            <p className="text-xs font-bold text-rose-300">{short ? "Not enough BNG for that pot" : PRIZE_PROBLEM_TEXT[problem!]}</p>
          )}
          {error && (
            <p role="alert" className="text-xs font-bold text-rose-300">
              {error}
            </p>
          )}
          <ActionButton type="submit" variant="primary" size="lg" disabled={busy || !!problem || short}>
            {busy ? "Setting it up…" : `Hold ${formatCoins(pot || 0)} BNG and schedule`}
          </ActionButton>
        </form>
      )}
    </Modal>
  )
}
