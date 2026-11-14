"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import type { RaceListing } from "@/lib/useColyseus"
import { STRESSED_THRESHOLD } from "@tiral/game-core"
import { usePlayer } from "@/lib/player"
import { formatCoins } from "@/lib/useCoins"
import { FoodGrid, FoodResultLine, useFoodPurchase } from "@/components/NeedsPanel"
import { ActionButton, untilText } from "@/components/ui"
import { PrizeRaces } from "@/components/hub/PrizeRaces"
import { GIG_INFO, HustleLadder, useLadder } from "@/components/hub/HustleLadder"

export type HubActions = {
  races: RaceListing[]
  loadingRaces: boolean
  joining: boolean
  error: string | null
  onRefresh(): void
  onQuickRace(): void
  onCreate(): void
  onJoin(roomId: string): void
  onJoinCode(code: string): void
  /** Something to tell the player (not an error), e.g. "you're signed up". */
  notice?: string | null
  /** Gently ring "Race now" (first run, before the player's first race). */
  highlightQuickRace?: boolean
}

/** Energy at or below this shows the food tile in Today. */
const LOW_ENERGY = 35

function SectionTitle({ id, children, aside }: { id: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between">
      <h2 id={id} className="text-[11px] font-bold uppercase tracking-[0.12em] text-sheet-mute">
        {children}
      </h2>
      {aside}
    </div>
  )
}

/** Races anyone can join right now; the list updates by itself (the play page polls). */
function OpenRaces({ races, joining, onJoin, chip = false }: HubActions & { chip?: boolean }) {
  const joinable = races.filter(
    (race) =>
      // Prize races have their own section.
      !race.prize && !race.locked && (race.phase === "lobby" || race.phase === "countdown") && race.playerCount < race.maxClients
  )
  if (chip && joinable.length === 0) {
    return (
      <p className="flex min-h-11 items-center gap-2 rounded-2xl border border-sheet-line bg-sheet-card px-2.5 text-xs font-bold text-sheet-mute">
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-leaf" />
        Nobody waiting to race
      </p>
    )
  }
  return (
    <section aria-labelledby="open-races-title" className={chip ? "col-span-2" : undefined}>
      <SectionTitle
        id="open-races-title"
        aside={
          <span className="flex items-center gap-1.5 text-xs text-leaf">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-leaf" />
            Live
          </span>
        }
      >
        Open races
      </SectionTitle>
      {joinable.length === 0 ? (
        <p className="rounded-xl border border-sheet-line bg-sheet-card px-3 py-3 text-sm text-sheet-mute">
          Nobody&apos;s waiting right now. Race now starts one others can join.
        </p>
      ) : (
        <ul className="divide-y divide-sheet-line rounded-xl border border-sheet-line bg-sheet-card">
          {joinable.map((race) => (
            <li key={race.roomId}>
              <button
                type="button"
                disabled={joining}
                onClick={() => onJoin(race.roomId)}
                className="flex min-h-[48px] w-full items-center gap-3 px-3 text-left transition hover:bg-sheet-soft disabled:opacity-40"
              >
                <span className="font-mono text-sm font-bold tracking-[0.12em] text-sheet-ink">{race.roomCode}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-sheet-mute">
                  {race.playerCount} racer{race.playerCount === 1 ? "" : "s"}
                  {race.phase === "countdown" && race.countdownSeconds !== null ? ` · starts in ${race.countdownSeconds}s` : " · waiting"}
                </span>
                <span className="text-sm font-bold text-flame-deep">Join</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

type Tone = "blue" | "flame" | "leaf"

function Bubble({ icon, tone }: { icon: string; tone: Tone }) {
  const bg = tone === "flame" ? "bg-flame-soft" : tone === "leaf" ? "bg-leaf-soft" : "bg-sheet-soft"
  return (
    <span aria-hidden className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-[22px] leading-none ${bg}`}>
      {icon}
    </span>
  )
}

function PlayTile({
  icon,
  tone,
  label,
  disabled,
  pressed,
  onClick
}: {
  icon: string
  tone: Tone
  label: string
  disabled?: boolean
  pressed?: boolean
  onClick(): void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-expanded={pressed}
      onClick={onClick}
      className="flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-2xl border border-sheet-line bg-sheet-card px-1.5 py-2.5 text-center text-[12px] font-black leading-tight text-sheet-ink transition hover:bg-sheet-soft disabled:opacity-40"
    >
      <Bubble icon={icon} tone={tone} />
      {label}
    </button>
  )
}

function DayTile({
  icon,
  tone,
  name,
  meta,
  warn,
  href,
  onClick,
  expanded,
  wide
}: {
  icon: string
  tone: Tone
  name: string
  meta: string
  warn?: boolean
  href?: string
  onClick?(): void
  expanded?: boolean
  wide?: boolean
}) {
  const className = `flex min-h-24 flex-col items-center justify-center gap-1 rounded-2xl border border-sheet-line bg-sheet-card px-1.5 py-2.5 text-center transition hover:bg-sheet-soft ${wide ? "col-span-3 min-h-[4.5rem] flex-row justify-start gap-3 px-3.5 text-left" : ""}`
  const metaClass = `block w-full truncate text-[11px] font-bold ${warn ? "text-flame-deep" : "text-sheet-mute"}`
  const body = (
    <>
      <Bubble icon={icon} tone={tone} />
      {wide ? (
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-black text-sheet-ink">{name}</span>
          <span className={metaClass}>{meta}</span>
        </span>
      ) : (
        <>
          <span className="block w-full truncate text-[13px] font-black text-sheet-ink">{name}</span>
          <span className={metaClass}>{meta}</span>
        </>
      )}
    </>
  )
  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} aria-expanded={expanded} className={className}>
      {body}
    </button>
  )
}

/** "in 1d 17h" → "1d", so a tile stays one line. */
function shortWait(iso: string): string {
  return untilText(iso)
    .replace(/^in /, "")
    .replace(/(\d+h) \d+m/, "$1")
    .replace(/(\d+d) \d+h/, "$1")
}

/** Rent, requests, the next gig and where to go: an icon board, not a list. */
function Today({ open, onToggle }: { open: "food" | "earn" | null; onToggle(which: "food" | "earn"): void }) {
  const { player } = usePlayer()
  const food = useFoodPurchase()
  const ladder = useLadder()
  if (!player) return null
  const life = player.life
  const short = life ? Math.max(0, life.tier.rent - player.balance) : 0
  const dueSoon = life ? Date.parse(life.rentDueAt) - Date.now() < 24 * 3600_000 : false
  const requests = life?.events.filter((event) => event.status === "pending") ?? []
  const energy = Math.round(player.needs.energy)
  const step = ladder.next
  const gig = step ? GIG_INFO[step.gig] : null
  const gigMeta =
    step?.progress && !step.comingSoon
      ? `${step.progress.have} / ${step.progress.need} ${step.progress.label}`
      : step?.comingSoon
        ? "Coming soon"
        : "All open"

  return (
    <section aria-labelledby="today-title">
      <h2 id="today-title" className="mb-2 text-sm font-black text-sheet-ink">
        Today
      </h2>
      <div className="grid grid-cols-3 gap-2">
        {life && !life.ownHome && (short > 0 || dueSoon) && (
          <DayTile
            icon="🏠"
            tone="flame"
            name="Rent"
            meta={short > 0 ? `${formatCoins(short)} short` : "Covered"}
            warn={short > 0}
            href="/inbox"
          />
        )}
        {requests.slice(0, 2).map((event) => (
          <DayTile
            key={event.id}
            icon="💬"
            tone="blue"
            name={event.from}
            meta={event.expiresAt ? `${formatCoins(event.amount)} · ${shortWait(event.expiresAt)}` : formatCoins(event.amount)}
            href="/inbox"
          />
        ))}
        {life && life.stress >= STRESSED_THRESHOLD && <DayTile icon="😤" tone="flame" name="Stressed" meta="Energy slower" href="/inbox" />}
        {energy <= LOW_ENERGY && (
          <DayTile icon="⚡" tone="flame" name="Energy" meta={`${energy}%`} warn onClick={() => onToggle("food")} expanded={open === "food"} />
        )}
        <DayTile
          icon={gig?.icon ?? "💼"}
          tone="leaf"
          name={gig?.name ?? "Hustles"}
          meta={gigMeta}
          onClick={() => onToggle("earn")}
          expanded={open === "earn"}
        />
        <DayTile icon="🏉" tone="blue" name="Kyadondo" meta="Go out" href="/out?place=kyadondo" />
        <DayTile icon="🏗️" tone="leaf" name="Claim a plot" meta="Town and Lugogo" href="/land" wide />
      </div>
      {open === "food" && (
        <div className="mt-2 rounded-2xl border border-sheet-line bg-sheet-card px-3 py-2">
          <FoodGrid tone="light" limit={3} onBuy={(foodId) => void food.buy(foodId)} />
          <FoodResultLine tone="light" result={food.result} />
        </div>
      )}
    </section>
  )
}

/** "Race friends": start a private race, or join one with a code. */
function RaceFriends({ joining, onCreate, onJoinCode, onClose }: { joining: boolean; onCreate(): void; onJoinCode(code: string): void; onClose(): void }) {
  const [code, setCode] = useState("")
  return (
    <div className="rounded-xl border border-sheet-line bg-sheet-card p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-sheet-ink">Race friends</span>
        <button type="button" onClick={onClose} className="min-h-[44px] px-2 text-xs font-bold text-sheet-mute">
          Close
        </button>
      </div>
      <ActionButton variant="sheet" className="w-full" disabled={joining} onClick={onCreate}>
        Create a private race
      </ActionButton>
      <p className="mt-1.5 text-xs text-sheet-mute">You get a code to send your friends.</p>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (code.trim()) onJoinCode(code.trim())
        }}
      >
        <input
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="Friend's code"
          aria-label="Race code"
          maxLength={8}
          autoCapitalize="characters"
          autoComplete="off"
          className="min-h-[44px] w-full min-w-0 rounded-xl border border-sheet-line bg-sheet-card px-3 text-center font-mono text-base font-bold uppercase tracking-[0.2em] text-sheet-ink placeholder:font-sans placeholder:text-sm placeholder:normal-case placeholder:tracking-normal placeholder:text-sheet-mute"
        />
        <ActionButton type="submit" variant="sheet" disabled={joining || !code.trim()}>
          Join
        </ActionButton>
      </form>
    </div>
  )
}

// Between races: a big Race now, three play tiles, then today's board.
export function Hub(actions: HubActions) {
  const [friends, setFriends] = useState(false)
  const [hosting, setHosting] = useState(false)
  const [open, setOpen] = useState<"food" | "earn" | null>(null)
  const { joining, error } = actions
  const toggle = (which: "food" | "earn") => setOpen((current) => (current === which ? null : which))

  return (
    <div className="flex flex-col gap-4">
      {/* What shows at the phone sheet's resting height. */}
      <button
        type="button"
        disabled={joining}
        onClick={actions.onQuickRace}
        className={`flex min-h-[4.5rem] w-full items-center gap-3 rounded-2xl bg-flame px-3.5 text-left text-white transition hover:brightness-95 disabled:opacity-50 ${actions.highlightQuickRace ? "ring-4 ring-flame/30" : ""}`}
      >
        <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-lg font-black text-flame">
          ▶
        </span>
        <span className="min-w-0">
          <span className="block text-base font-black leading-tight">{joining ? "Finding a race…" : "Race now"}</span>
          <span className="block truncate text-xs font-bold text-white/80">Matched in under 30 seconds</span>
        </span>
      </button>
      <div className="grid grid-cols-3 gap-2">
        <PlayTile icon="👥" tone="blue" label="Race friends" disabled={joining} pressed={friends} onClick={() => setFriends((value) => !value)} />
        <PlayTile icon="🏆" tone="flame" label="Host a prize" disabled={joining} onClick={() => setHosting(true)} />
        <PlayTile icon="💼" tone="leaf" label="Earn BNG" pressed={open === "earn"} onClick={() => toggle("earn")} />
      </div>
      {friends && <RaceFriends joining={joining} onCreate={actions.onCreate} onJoinCode={actions.onJoinCode} onClose={() => setFriends(false)} />}
      {error && (
        <p role="alert" className="rounded-lg bg-flame-soft px-3 py-2 text-xs font-bold text-flame-deep">
          {error}
        </p>
      )}
      {actions.notice && (
        <p role="status" className="rounded-lg bg-sheet-soft px-3 py-2 text-xs font-bold text-sheet-ink">
          {actions.notice}
        </p>
      )}
      {open === "earn" && <HustleLadder />}

      <div className="grid grid-cols-2 gap-2">
        <PrizeRaces openRaces={actions.races} joining={joining} onJoinCode={actions.onJoinCode} hosting={hosting} onHostingChange={setHosting} chip />
        <OpenRaces {...actions} chip />
      </div>

      <Today open={open} onToggle={toggle} />
    </div>
  )
}
