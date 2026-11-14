"use client"

import { useMemo, useState } from "react"
import { privyEnabled, requestPrivyLogin } from "@/lib/privy"
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
import { ActionButton, ConfirmButton } from "@/components/ui"
import { Modal } from "@/components/ui/Modal"

const PLACE = ["1st", "2nd", "3rd", "4th", "5th"]

/** Each place's payout, in BNG (after the cut). */
function payouts(race: { pot: number; shares: number[] }) {
  return splitPrize(race.pot, race.shares, race.shares.length).payouts
}

/**
 * Show the host's message only when it reads like words: a test like "dvswevr"
 * on a public card makes the whole race look broken.
 */
function readable(message: string | null) {
  const text = (message ?? "").trim()
  if (text.length < 3) return null
  const letters = text.replace(/[^a-z]/gi, "")
  const vowels = letters.replace(/[^aeiouy]/gi, "").length
  return /\s/.test(text) || (letters.length > 0 && vowels / letters.length >= 0.25) ? text : null
}

function HostPhoto({ url, name }: { url: string | null | undefined; name: string }) {
  const [failed, setFailed] = useState(false)
  if (url && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" onError={() => setFailed(true)} className="h-9 w-9 shrink-0 rounded-full border border-sheet-line object-cover" />
  }
  return (
    <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sheet-chip text-sm font-black text-sheet-chipink">
      {name.trim().charAt(0).toUpperCase() || "T"}
    </span>
  )
}

/** Prize races in the hub: upcoming races, "I'm in", join when open, and the host's own controls. */
export function PrizeRaces({
  openRaces,
  joining,
  onJoinCode,
  hosting,
  onHostingChange,
  chip = false
}: {
  openRaces: RaceListing[]
  joining: boolean
  onJoinCode(code: string): void
  /** The "Host a prize race" form is open (its button lives at the top of the hub). */
  hosting: boolean
  onHostingChange(open: boolean): void
  /** Empty state is a short chip so it can sit beside the open-races chip. */
  chip?: boolean
}) {
  const { player } = usePlayer()
  const prizes = usePrizeRaces()
  const [notice, setNotice] = useState<string | null>(null)
  const [sharing, setSharing] = useState<ShareCard | null>(null)
  const openCodes = new Set(openRaces.filter((race) => race.prize && !race.locked).map((race) => race.roomCode))
  const upcoming = prizes.races.filter((race) => race.status === "scheduled").length

  const hostModal = hosting && (
    <HostPrizeRace
      onClose={() => onHostingChange(false)}
      onCreate={async (input) => {
        const result = await prizes.create(input)
        if (result.race) {
          onHostingChange(false)
          setNotice(`Your race is up: code ${result.race.roomCode}.`)
          setSharing(raceShareCard({ roomCode: result.race.roomCode, pot: result.race.pot, host: result.race.host.name }))
        }
        return result.error
      }}
    />
  )

  if (chip && prizes.races.length === 0) {
    return (
      <div>
        <p className="flex min-h-11 items-center gap-2 rounded-2xl border border-sheet-line bg-sheet-card px-2.5 text-xs font-bold text-sheet-mute">
          <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-flame-soft text-[13px]">
            🏆
          </span>
          {prizes.loading ? "Loading…" : "No prize races yet"}
        </p>
        {notice && (
          <p role="status" className="mt-2 text-xs font-bold text-sheet-ink">
            {notice}
          </p>
        )}
        {sharing && <ShareSheet card={sharing} onClose={() => setSharing(null)} />}
        {hostModal}
      </div>
    )
  }

  return (
    <section aria-labelledby="prize-races-title" className={chip ? "col-span-2" : undefined}>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 id="prize-races-title" className="text-[11px] font-bold uppercase tracking-[0.12em] text-sheet-mute">
          Prize races
        </h2>
        {upcoming > 0 && <span className="text-xs text-sheet-mute">{upcoming} upcoming</span>}
      </div>
      {prizes.races.length === 0 ? (
        <p className="rounded-xl border border-sheet-line bg-sheet-card px-3 py-3 text-sm text-sheet-mute">
          {prizes.loading ? "Loading…" : "No prize races yet. Put up a pot and race your friends for it."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
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
        <p role="status" className="mt-2 text-xs font-bold text-sheet-ink">
          {notice}
        </p>
      )}
      {sharing && <ShareSheet card={sharing} onClose={() => setSharing(null)} />}
      {hostModal}
    </section>
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
  const [menu, setMenu] = useState(false)
  const racing = race.status === "live"
  const message = readable(race.message)
  const joined = race.signups === 0 ? (isHost ? "no one in yet" : "be the first in") : `${race.signups} in`
  return (
    <li className="rounded-xl border border-sheet-line bg-sheet-card p-3">
      <div className="flex items-center gap-2.5">
        <HostPhoto url={race.hostAvatarUrl} name={race.host.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-bold text-sheet-ink">{race.host.name}</span>
            {isHost && <span className="shrink-0 rounded-md bg-flame-soft px-1.5 py-0.5 text-[11px] font-bold text-flame-deep">Your race</span>}
          </div>
          <div className="truncate text-xs text-sheet-mute">
            {racing ? <span className="font-bold text-leaf">Racing now</span> : `${startLabel(race.startsAt)} · ${untilLabel(race.startsAt)} · ${joined}`}
          </div>
        </div>
        {isHost && !racing && (
          <button
            type="button"
            aria-label="More options"
            aria-expanded={menu}
            onClick={() => setMenu((value) => !value)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-lg text-sheet-mute hover:bg-sheet-soft"
          >
            ⋯
          </button>
        )}
      </div>

      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-2xl font-black tabular-nums text-sheet-blue">{formatCoins(race.pot)}</span>
        <span className="text-xs font-bold text-sheet-mute">BNG</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {payouts(race).map((amount, index) => (
          <span key={index} className="rounded-md bg-sheet-chip px-2 py-0.5 text-xs tabular-nums text-sheet-chipink">
            {PLACE[index]} {formatCoins(amount)}
          </span>
        ))}
      </div>
      {message && <p className="mt-2 truncate text-xs text-sheet-mute">“{message}”</p>}

      {menu && isHost && (
        <div className="mt-2 flex flex-col gap-1 rounded-lg border border-sheet-line bg-sheet p-1.5">
          <span className="px-2 py-1 text-xs text-sheet-mute">Race code {race.roomCode}</span>
          <ConfirmButton
            className="min-h-[44px] rounded-md px-2 text-left text-sm font-bold text-flame-deep hover:bg-flame-soft"
            armedClassName="!bg-flame-deep !text-white"
            confirmLabel="Tap again to cancel and get the pot back"
            onConfirm={onCancel}
          >
            Cancel race
          </ConfirmButton>
        </div>
      )}

      {!racing && (
        <div className="mt-3 flex gap-2">
          {isHost ? (
            <>
              <ActionButton variant="flame" className="flex-1 text-sm" onClick={onShare}>
                Share poster
              </ActionButton>
              {open && (
                <ActionButton variant="sheet" className="text-sm" disabled={joining} onClick={onJoin}>
                  Open room
                </ActionButton>
              )}
            </>
          ) : (
            <>
              {open ? (
                <ActionButton variant="flame" className="flex-1 text-sm" disabled={joining} onClick={onJoin}>
                  Join race
                </ActionButton>
              ) : (
                <ActionButton variant={race.signedUp ? "sheet" : "sheet-ghost"} className="flex-1 text-sm" aria-pressed={race.signedUp} onClick={() => onSignUp(!race.signedUp)}>
                  {race.signedUp ? "You're in ✓" : "I'm in"}
                </ActionButton>
              )}
              <ActionButton variant="sheet" className="text-sm" onClick={onShare}>
                Share
              </ActionButton>
            </>
          )}
        </div>
      )}
      {!racing && !open && !isHost && race.signedUp && (
        <p className="mt-1.5 text-xs text-sheet-mute">We&apos;ll remind you in your inbox before it starts.</p>
      )}
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

  const linked = player?.user.signedIn === true
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
      className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-3xl border border-sheet-line bg-sheet p-5 text-sheet-ink shadow-2xl"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black">🏆 Host a prize race</h2>
        <button type="button" onClick={onClose} className="min-h-[44px] px-3 text-xs font-bold text-sheet-mute">
          Close
        </button>
      </div>
      {!linked ? (
        <div className="mt-3 rounded-xl border border-sheet-line bg-sheet-card p-3 text-sm text-sheet-ink">
          Sign in to host a prize race. Guest coins live on one device.
          {privyEnabled && (
            <button type="button" onClick={requestPrivyLogin} className="mt-2 block font-bold text-flame-deep">
              Sign in →
            </button>
          )}
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
          <label className="flex flex-col gap-1 text-xs font-bold text-sheet-mute">
            Pot (BNG) · you have {formatCoins(balance)}
            <input
              type="number"
              inputMode="numeric"
              min={PRIZE_MIN_POT}
              step={500}
              value={Number.isFinite(pot) ? pot : ""}
              onChange={(event) => setPot(Math.floor(Number(event.target.value)))}
              className="min-h-[44px] rounded-xl border border-sheet-line bg-sheet-card px-3 font-mono text-base text-sheet-ink"
            />
          </label>

          <div>
            <div className="mb-1 text-xs font-bold text-sheet-mute">Winners</div>
            <div className="flex gap-1.5">
              {Array.from({ length: PRIZE_MAX_WINNERS }, (_, index) => index + 1).map((count) => (
                <button
                  key={count}
                  type="button"
                  aria-pressed={shares.length === count}
                  onClick={() => setWinners(count)}
                  className={`min-h-[44px] flex-1 rounded-xl border text-sm font-black ${
                    shares.length === count ? "border-flame bg-flame-soft text-flame-deep" : "border-sheet-line bg-sheet-card text-sheet-ink"
                  }`}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs font-bold text-sheet-mute">Each winner&apos;s share (%) · must add up to 100</div>
            <div className="flex flex-col gap-1.5">
              {shares.map((share, index) => (
                <label key={index} className="flex items-center gap-2 text-xs text-sheet-mute">
                  <span className="w-10 font-bold">{PLACE[index]}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={5}
                    max={100}
                    value={share}
                    onChange={(event) => setShares(shares.map((value, i) => (i === index ? Math.floor(Number(event.target.value)) : value)))}
                    className="min-h-[44px] w-20 rounded-xl border border-sheet-line bg-sheet-card px-2 text-center font-mono text-base text-sheet-ink"
                    aria-label={`${PLACE[index]} place share in percent`}
                  />
                  <span className="font-mono text-flame-deep">{formatCoins(split.payouts[index] ?? 0)} BNG</span>
                </label>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-sheet-mute">
              Total {shares.reduce((sum, value) => sum + (value || 0), 0)}% · Tiral keeps {Math.round(PRIZE_CUT_SHARE * 100)}% (
              {formatCoins(split.cut)} BNG). You can&apos;t win your own prize.
            </p>
          </div>

          <label className="flex flex-col gap-1 text-xs font-bold text-sheet-mute">
            Starts (your time)
            <input
              type="datetime-local"
              value={startsAt}
              min={localInput(Date.now() + HOSTED_MIN_LEAD_MS)}
              max={localInput(Date.now() + HOSTED_MAX_LEAD_MS)}
              onChange={(event) => setStartsAt(event.target.value)}
              className="min-h-[44px] rounded-xl border border-sheet-line bg-sheet-card px-3 text-base text-sheet-ink [color-scheme:light]"
            />
            <span className="font-normal text-sheet-mute">15 minutes to 7 days from now. People can say &quot;I&apos;m in&quot; until then.</span>
          </label>

          <div>
            <div className="mb-1 text-xs font-bold text-sheet-mute">Countdown once the start time comes</div>
            <div className="flex gap-1.5">
              {HOSTED_COUNTDOWN_CHOICES.map((seconds) => (
                <button
                  key={seconds}
                  type="button"
                  aria-pressed={countdown === seconds}
                  onClick={() => setCountdown(seconds)}
                  className={`min-h-[44px] flex-1 rounded-xl border text-xs font-black ${
                    countdown === seconds ? "border-flame bg-flame-soft text-flame-deep" : "border-sheet-line bg-sheet-card text-sheet-ink"
                  }`}
                >
                  {seconds < 60 ? `${seconds} s` : `${seconds / 60} min`}
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1 text-xs font-bold text-sheet-mute">
            Message (optional)
            <input
              value={message}
              maxLength={PRIZE_MESSAGE_MAX}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Kikuubo boda kings 🏆"
              className="min-h-[44px] rounded-xl border border-sheet-line bg-sheet-card px-3 text-base text-sheet-ink placeholder:text-sheet-mute"
            />
          </label>

          <p className="rounded-xl border border-sheet-line bg-sheet-soft px-3 py-2 text-xs text-sheet-ink">
            {formatCoins(pot || 0)} BNG leaves your wallet now and is held until the race on {start.getTime() ? startLabel(start.toISOString()) : "…"}.
            If fewer than 2 other people race, or nobody reaches the treasure, it all comes back.
          </p>
          {(problem || short) && (
            <p className="text-xs font-bold text-flame-deep">{short ? "Not enough BNG for that pot" : PRIZE_PROBLEM_TEXT[problem!]}</p>
          )}
          {error && (
            <p role="alert" className="text-xs font-bold text-flame-deep">
              {error}
            </p>
          )}
          <ActionButton type="submit" variant="flame" size="lg" disabled={busy || !!problem || short}>
            {busy ? "Setting it up…" : `Hold ${formatCoins(pot || 0)} BNG and schedule`}
          </ActionButton>
        </form>
      )}
    </Modal>
  )
}
