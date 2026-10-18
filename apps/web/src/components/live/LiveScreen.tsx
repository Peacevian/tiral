"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  GRADE_NAMES,
  LIVE_GRADES,
  LIVE_SECONDS,
  LIVTOK_BALES,
  PRICE_FACTOR,
  findBale,
  piecePrice,
  type LiveGrade,
  type PriceLevel
} from "@tiral/game-core"
import { useColyseusContext, useColyseusStatus } from "@/components/ColyseusProvider"
import { usePlayer } from "@/lib/player"
import { formatCoins } from "@/lib/useCoins"
import type { LiveState } from "@/lib/useColyseus"
import { ActionButton, Card, SectionLabel } from "@/components/ui"
import { useNow } from "@/components/hustle/JobBoard"
import { PageLoader } from "@/components/loader/Loader"

// LivTok: sell mitumba on live (tier 2). The Owino market and your stock, then
// a phone-style live: hold up a piece, set the price, answer the comments,
// and buyers claim it. The game server runs the viewers and buyers.

const LEVELS: PriceLevel[] = ["low", "fair", "high"]
const LEVEL_NAMES: Record<PriceLevel, string> = { low: "Low", fair: "Fair", high: "High" }

function BackToBase() {
  const router = useRouter()
  const { connected, leaveRoom } = useColyseusContext()
  return (
    <button
      type="button"
      onClick={() => {
        if (connected) leaveRoom()
        router.push("/play")
      }}
      className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-xl border border-sheet-line bg-sheet-card text-sm font-bold text-sheet-ink"
    >
      Back to base
    </button>
  )
}

/** Remaining time from a server "…Ms" field, counted down locally. */
function msLeft(state: LiveState, value: number | null, now: number) {
  return value === null ? null : Math.max(0, value - (now - state.receivedAt))
}

function clock(ms: number) {
  const seconds = Math.ceil(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

/**
 * Leaving the page (the app's navigation is on screen here) closes the room,
 * like Back to base: a shift or live in progress ends and is paid.
 */
function useLeaveRoomOnExit(open: boolean) {
  const { leaveRoom } = useColyseusStatus()
  const openRef = useRef(open)
  openRef.current = open
  useEffect(
    () => () => {
      if (openRef.current) leaveRoom()
    },
    [leaveRoom]
  )
}

export function LiveScreen() {
  const { player } = usePlayer()
  const { connected, live, liveEvent, startLive, leaveRoom } = useColyseusContext()
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)
  const allowed = player?.career?.tier !== undefined && player.career.tier !== "street" && player.user.tiktokLinked
  useLeaveRoomOnExit(live !== null)

  // Open the market and stock as soon as we know you're allowed in.
  useEffect(() => {
    if (!player || !allowed || live || started.current) return
    started.current = true
    if (connected) leaveRoom()
    startLive().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Couldn't open LivTok")
      started.current = false
    })
  }, [player, allowed, live, connected, leaveRoom, startLive])

  return (
    <main className="min-h-dvh w-full overflow-y-auto bg-sheet px-3 pb-[calc(var(--shell-bottom)+1.5rem)] pt-[calc(var(--shell-top)+1rem)] text-sheet-ink">
      <div className="mx-auto w-full max-w-md">
        {!player ? null : !allowed ? (
          <Closed tiktok={player.user.tiktokLinked} />
        ) : !live ? (
          error ? (
            <Card className="mt-2 text-center text-sm text-sheet-mute">{error}</Card>
          ) : (
            <PageLoader label="Opening LivTok…" />
          )
        ) : live.phase === "live" ? (
          <OnAir live={live} />
        ) : live.phase === "closed" && live.summary ? (
          <Receipt live={live} />
        ) : (
          <Setup live={live} event={liveEvent} />
        )}
      </div>
    </main>
  )
}

function Closed({ tiktok }: { tiktok: boolean }) {
  return (
    <Card className="mt-2">
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-flame-deep">Small business</div>
      <h1 className="mt-1 text-xl font-black">📱 LivTok mitumba</h1>
      <p className="mt-2 text-sm text-sheet-mute">
        {tiktok
          ? "Move up to Small business first: run 5 rolex shifts and save 500,000, then move up from Earn BNG in the Race sidebar."
          : "LivTok sellers need TikTok connected (account menu, top right), then move up to Small business from Earn BNG."}
      </p>
      <div className="mt-4 flex">
        <BackToBase />
      </div>
    </Card>
  )
}

function StockLine({ stock }: { stock: LiveState["stock"] }) {
  const bales = LIVTOK_BALES.filter((bale) => stock[bale.id] && LIVE_GRADES.some((grade) => stock[bale.id]![grade] > 0))
  if (bales.length === 0) return <p className="text-sm text-sheet-mute">No stock yet. Buy a bale below.</p>
  return (
    <ul className="flex flex-col gap-1.5">
      {bales.map((bale) => (
        <li key={bale.id} className="flex items-center justify-between rounded-xl border border-sheet-line bg-sheet-card px-3 py-2 text-sm">
          <span className="font-bold">
            {bale.icon} {bale.name}
          </span>
          <span className="font-mono text-xs text-sheet-blue">
            {stock[bale.id]!.first} · {stock[bale.id]!.second} · {stock[bale.id]!.third}
          </span>
        </li>
      ))}
    </ul>
  )
}

function Setup({ live, event }: { live: LiveState; event: ReturnType<typeof useColyseusContext>["liveEvent"] }) {
  const { player } = usePlayer()
  const { sendStall } = useColyseusContext()
  const now = useNow(500)
  const [buying, setBuying] = useState<string | null>(null)
  useEffect(() => {
    if (event) setBuying(null)
  }, [event])
  const toast = event && now - event.at < 6000 ? event : null
  const hasStock = Object.values(live.stock).some((counts) => counts.first + counts.second + counts.third > 0)
  return (
    <>
      <Card>
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-flame-deep">Small business</div>
            <h1 className="mt-0.5 text-xl font-black">📱 LivTok mitumba</h1>
          </div>
          <div className="text-right">
            <div className="font-mono text-base font-black text-sheet-blue">{formatCoins(live.followers)}</div>
            <div className="text-[11px] text-sheet-mute">followers</div>
          </div>
        </div>
        <p className="mt-1 text-sm text-sheet-mute">
          Go live for {LIVE_SECONDS / 60} minutes: hold up a piece, set the price, answer the comments. Most buyers pay after the live; a few
          vanish. A boda takes each order: 1,000 a delivery.
        </p>
        <div className="mt-3">
          <SectionLabel aside={<span className="font-mono text-[11px]">first · second · third</span>}>Your stock</SectionLabel>
          <StockLine stock={live.stock} />
        </div>
        {toast?.kind === "baleOpened" && (
          <p role="status" className="mt-2 rounded-lg bg-leaf-soft px-3 py-2 text-xs font-bold text-leaf">
            Opened your {findBale(toast.bale)?.name.toLowerCase()} bale: {toast.counts.first} first class, {toast.counts.second} second,{" "}
            {toast.counts.third} third.
          </p>
        )}
        {toast?.kind === "notice" && (
          <p role="alert" className="mt-2 rounded-lg bg-flame-soft px-3 py-2 text-xs font-bold text-flame-deep">
            {toast.text}
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <BackToBase />
          <ActionButton variant="flame" size="lg" className="flex-[2]" disabled={!hasStock} onClick={() => sendStall("goLive")}>
            🔴 Go live
          </ActionButton>
        </div>
      </Card>
      <div className="mt-4">
        <SectionLabel aside={player ? <span className="font-mono">🪙 {formatCoins(player.balance)}</span> : null}>Owino bale market</SectionLabel>
        <ul className="flex flex-col gap-2">
          {LIVTOK_BALES.map((bale) => (
            <li key={bale.id} className="flex items-center gap-3 rounded-xl border border-sheet-line bg-sheet-card p-3">
              <span aria-hidden className="text-2xl">
                {bale.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-black">{bale.name}</div>
                <div className="text-xs text-sheet-mute">
                  {bale.pieces} pieces · sell {formatCoins(bale.fair.third)}–{formatCoins(bale.fair.first)} each
                </div>
              </div>
              <ActionButton
                variant="sheet"
                disabled={buying !== null || (player?.balance ?? 0) < bale.price}
                onClick={() => {
                  setBuying(bale.id)
                  sendStall("buyBale", bale.id)
                }}
              >
                {buying === bale.id ? "Buying…" : formatCoins(bale.price)}
              </ActionButton>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-sheet-mute">Each bale opens to a mix of first, second and third class. Some bales are mostly third.</p>
      </div>
    </>
  )
}

function OnAir({ live }: { live: LiveState }) {
  const { sendStall } = useColyseusContext()
  const now = useNow(200)
  const [bale, setBale] = useState<string>(() => LIVTOK_BALES.find((candidate) => live.stock[candidate.id])?.id ?? "tops")
  const [level, setLevel] = useState<PriceLevel>("fair")
  const left = msLeft(live, live.leftMs, now) ?? 0
  const showing = live.showing
  const busy = showing !== null && showing.outcome === null
  const answerLeft = showing ? msLeft(live, showing.answerLeftMs, now) : null
  const baleStock = live.stock[bale] ?? { first: 0, second: 0, third: 0 }
  const bales = LIVTOK_BALES.filter((candidate) => live.stock[candidate.id])
  const show = (grade: LiveGrade) => sendStall("show", { bale, grade, level })
  return (
    <div className="overflow-hidden rounded-3xl border border-sheet-line bg-sheet-ink text-white shadow-2xl">
      {/* The "phone": status bar, the piece on show, comments over it. */}
      <div className="flex items-center gap-2 px-3 pt-3 text-xs font-bold">
        <span className="rounded-md bg-flame px-2 py-0.5">🔴 LIVE</span>
        <span className="font-mono">{clock(left)}</span>
        <span className="ml-auto">👁 {live.viewers}</span>
        <span>❤️ {formatCoins(live.hearts)}</span>
      </div>
      <div className="relative mx-3 mt-3 flex min-h-[220px] flex-col items-center justify-center rounded-2xl bg-white/10 p-4 text-center">
        {showing ? (
          <>
            <div className="text-5xl" aria-hidden>
              {findBale(showing.bale)?.icon}
            </div>
            <div className="mt-2 text-sm font-black">
              {GRADE_NAMES[showing.grade]} {findBale(showing.bale)?.name.toLowerCase()}
            </div>
            <div className="mt-1 rounded-full bg-flame px-3 py-1 font-mono text-lg font-black">{formatCoins(showing.price)}</div>
            {showing.outcome === "sold" && (
              <div className="mt-2 rounded-lg bg-leaf px-3 py-1 text-xs font-black">SOLD to {showing.buyer} 🙋</div>
            )}
            {showing.outcome === "no_takers" && <div className="mt-2 rounded-lg bg-white/20 px-3 py-1 text-xs font-black">No takers</div>}
            {showing.outcome === null && !showing.question && <div className="mt-2 text-xs text-white/70">Showing it to the camera…</div>}
            {showing.outcome === null && showing.answer !== null && <div className="mt-2 text-xs text-white/70">Buyers are thinking…</div>}
          </>
        ) : (
          <p className="text-sm text-white/80">Pick a piece below and hold it up to the camera.</p>
        )}
      </div>
      <ul aria-live="polite" className="flex h-32 flex-col justify-end gap-0.5 overflow-hidden px-3 pt-2 text-xs">
        {live.comments.slice(-6).map((comment) => (
          <li key={comment.id} className={comment.kind === "claim" ? "font-black text-[#FFB37A]" : comment.kind === "you" ? "text-[#B9D3F5]" : ""}>
            <span className="font-bold text-white/70">{comment.from}</span> {comment.text}
          </li>
        ))}
      </ul>
      {/* Answer the question that's up, before it times out. */}
      <div className="bg-sheet p-3 text-sheet-ink">
        {showing?.question && showing.answer === null ? (
          <div>
            <div className="flex items-baseline justify-between text-xs font-bold">
              <span>💬 {showing.question.text}</span>
              <span className="font-mono text-flame-deep">{answerLeft !== null ? Math.ceil(answerLeft / 1000) : ""}s</span>
            </div>
            <div className="mt-2 flex flex-col gap-1.5">
              {showing.question.replies.map((reply, index) => (
                <button
                  key={reply}
                  type="button"
                  onClick={() => sendStall("reply", index)}
                  className="min-h-[44px] rounded-xl border border-sheet-line bg-sheet-card px-3 text-left text-sm font-bold text-sheet-ink hover:bg-sheet-soft"
                >
                  {reply}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            {bales.length > 1 && (
              <div className="mb-2 flex gap-1.5">
                {bales.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    aria-pressed={bale === candidate.id}
                    onClick={() => setBale(candidate.id)}
                    className={`min-h-[40px] flex-1 rounded-lg border text-xs font-bold ${bale === candidate.id ? "border-flame bg-flame-soft text-flame-deep" : "border-sheet-line bg-sheet-card"}`}
                  >
                    {candidate.icon} {candidate.name}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-1.5" role="group" aria-label="Price">
              {LEVELS.map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  aria-pressed={level === candidate}
                  onClick={() => setLevel(candidate)}
                  className={`min-h-[40px] flex-1 rounded-lg border text-xs font-bold ${level === candidate ? "border-flame bg-flame text-white" : "border-sheet-line bg-sheet-card"}`}
                >
                  {LEVEL_NAMES[candidate]} ×{PRICE_FACTOR[candidate]}
                </button>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {LIVE_GRADES.map((grade) => (
                <button
                  key={grade}
                  type="button"
                  disabled={busy || baleStock[grade] <= 0}
                  onClick={() => show(grade)}
                  className="flex min-h-[64px] flex-col items-center justify-center rounded-xl border border-sheet-line bg-sheet-card text-xs font-bold disabled:opacity-40"
                >
                  <span>{GRADE_NAMES[grade]}</span>
                  <span className="font-mono text-sheet-blue">{formatCoins(piecePrice(bale, grade, level))}</span>
                  <span className="text-[11px] text-sheet-mute">{baleStock[grade]} left</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="mt-3 flex items-center justify-between text-xs">
          <span>
            Orders: <span className="font-black">{live.orders}</span> · <span className="font-mono text-sheet-blue">{formatCoins(live.ordersValue)}</span>
          </span>
          <button type="button" onClick={() => sendStall("end")} className="min-h-[44px] px-2 font-bold text-flame-deep">
            End live
          </button>
        </div>
      </div>
    </div>
  )
}

function Receipt({ live }: { live: LiveState }) {
  const { sendStall } = useColyseusContext()
  const summary = live.summary!
  const profit = summary.net - summary.cost
  return (
    <Card>
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-flame-deep">Live ended</div>
      <h1 className="mt-1 text-xl font-black">{summary.net > 0 ? `+${formatCoins(summary.net)} BNG` : "No sales this time"}</h1>
      <dl className="mt-3 flex flex-col gap-1 text-sm">
        {[
          ["Claimed on live", `${summary.sold} pieces`],
          ["Paid up", `${summary.paid} buyers`],
          ["Vanished without paying", `${summary.ghosts} (pieces back in stock)`],
          ["Sales", formatCoins(summary.gross)],
          ["Boda deliveries", `−${formatCoins(summary.delivery)}`],
          ["Paid to you", formatCoins(summary.net)],
          ["What those pieces cost at Owino", formatCoins(summary.cost)],
          ["Profit on the bale", `${profit >= 0 ? "+" : "−"}${formatCoins(Math.abs(profit))}`],
          ["Followers", `${formatCoins(summary.followers)} (${summary.followerDelta >= 0 ? "+" : ""}${summary.followerDelta})`]
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2 border-b border-sheet-line pb-1 last:border-0">
            <dt className="text-sheet-mute">{label}</dt>
            <dd className="font-mono font-bold text-sheet-blue">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex gap-2">
        <BackToBase />
        <ActionButton variant="flame" className="flex-[2]" onClick={() => sendStall("again")}>
          Back to stock
        </ActionButton>
      </div>
    </Card>
  )
}
