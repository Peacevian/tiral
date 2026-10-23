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
import { HustleLadder, nextUnlockText, useLadder } from "@/components/hub/HustleLadder"

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

/** Energy at or below this shows the food row in "Needs attention". */
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
function OpenRaces({ races, joining, onJoin }: HubActions) {
  const joinable = races.filter(
    (race) =>
      // Prize races have their own section.
      !race.prize && !race.locked && (race.phase === "lobby" || race.phase === "countdown") && race.playerCount < race.maxClients
  )
  return (
    <section aria-labelledby="open-races-title">
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

/** One quiet row: an icon, a line, a detail, and where it leads. */
function AttentionRow({
  icon,
  title,
  detail,
  warn,
  href,
  onClick,
  expanded
}: {
  icon: string
  title: string
  detail: string
  /** Say the detail in the warning colour (money short). */
  warn?: boolean
  href?: string
  onClick?(): void
  expanded?: boolean
}) {
  const body = (
    <>
      <span aria-hidden className="w-6 shrink-0 text-center text-lg">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-sheet-ink">{title}</span>
        <span className={`block truncate text-xs ${warn ? "font-bold text-flame-deep" : "text-sheet-mute"}`}>{detail}</span>
      </span>
      <span aria-hidden className={`text-lg text-sheet-mute transition ${expanded ? "rotate-90" : ""}`}>
        ›
      </span>
    </>
  )
  const className = "flex min-h-[56px] w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-sheet-soft"
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

/** Rent, requests, low energy and earning: one compact list that leads elsewhere. */
function NeedsAttention() {
  const { player } = usePlayer()
  const food = useFoodPurchase()
  const [open, setOpen] = useState<"food" | "earn" | null>(null)
  const ladder = useLadder()
  if (!player) return null
  const life = player.life
  const short = life ? Math.max(0, life.tier.rent - player.balance) : 0
  const dueSoon = life ? Date.parse(life.rentDueAt) - Date.now() < 24 * 3600_000 : false
  const requests = life?.events.filter((event) => event.status === "pending") ?? []
  const energy = Math.round(player.needs.energy)
  const toggle = (which: "food" | "earn") => setOpen((current) => (current === which ? null : which))

  return (
    <section aria-labelledby="attention-title">
      <SectionTitle id="attention-title">Needs attention</SectionTitle>
      <div className="divide-y divide-sheet-line overflow-hidden rounded-xl border border-sheet-line bg-sheet-card">
        {life && (short > 0 || dueSoon) && (
          <AttentionRow
            icon="🏠"
            title={`Rent due ${untilText(life.rentDueAt)}`}
            detail={short > 0 ? `${formatCoins(short)} BNG short of ${formatCoins(life.tier.rent)}` : `${formatCoins(life.tier.rent)} BNG, and you have it`}
            warn={short > 0}
            href="/inbox"
          />
        )}
        {requests.slice(0, 2).map((event) => (
          <AttentionRow
            key={event.id}
            icon="💬"
            title={`${event.from} is asking for ${formatCoins(event.amount)} BNG`}
            detail={event.expiresAt ? `Answer ${untilText(event.expiresAt)}` : "Waiting for your answer"}
            href="/inbox"
          />
        ))}
        {life && life.stress >= STRESSED_THRESHOLD && (
          <AttentionRow icon="😤" title="You're stressed" detail="Energy refills slower until it eases" href="/inbox" />
        )}
        {energy <= LOW_ENERGY && (
          <>
            <AttentionRow
              icon="⚡"
              title={`Low energy: ${energy}%`}
              detail="Eat something before you race"
              onClick={() => toggle("food")}
              expanded={open === "food"}
            />
            {open === "food" && (
              <div className="px-3 pb-3 pt-1">
                <FoodGrid tone="light" limit={3} onBuy={(foodId) => void food.buy(foodId)} />
                <FoodResultLine tone="light" result={food.result} />
              </div>
            )}
          </>
        )}
        <AttentionRow icon="💼" title="Earn BNG" detail={nextUnlockText(ladder.next, ladder.balance, ladder.tier)} onClick={() => toggle("earn")} expanded={open === "earn"} />
        {open === "earn" && <HustleLadder />}
        <AttentionRow icon="🏉" title="Go out: Kyadondo" detail="Music, pork and drinks with everyone who's out" href="/out?place=kyadondo" />
        <AttentionRow icon="🏗️" title="Land: claim a plot" detail="Empty plots in town and Lugogo, yours to build on" href="/land" />
      </div>
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

// Between races: one main action (race now), the ways to race with people
// (friends, prize races, open races), then a short list of what needs attention.
export function Hub(actions: HubActions) {
  const [friends, setFriends] = useState(false)
  const [hosting, setHosting] = useState(false)
  const { joining, error } = actions

  return (
    <div className="flex flex-col gap-5">
      {/* What shows at the phone sheet's resting height. */}
      <div className="flex flex-col gap-2">
        <ActionButton
          variant="flame"
          size="lg"
          disabled={joining}
          onClick={actions.onQuickRace}
          className={`w-full ${actions.highlightQuickRace ? "ring-4 ring-flame/30" : ""}`}
        >
          {joining ? "Finding a race…" : "▶ Race now"}
        </ActionButton>
        <p className="text-center text-xs text-sheet-mute">Matched with whoever&apos;s online. Usually under 30 seconds.</p>
        <div className="grid grid-cols-2 gap-2">
          <ActionButton variant="sheet" disabled={joining} onClick={() => setFriends((value) => !value)} aria-expanded={friends}>
            👥 Race friends
          </ActionButton>
          <ActionButton variant="sheet" disabled={joining} onClick={() => setHosting(true)}>
            🏆 Host a prize
          </ActionButton>
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
      </div>

      <PrizeRaces openRaces={actions.races} joining={joining} onJoinCode={actions.onJoinCode} hosting={hosting} onHostingChange={setHosting} />

      <OpenRaces {...actions} />

      <NeedsAttention />
    </div>
  )
}
