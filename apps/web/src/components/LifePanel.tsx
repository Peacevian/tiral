"use client"

import { useState } from "react"
import { HOUSING_TIERS, STRESSED_THRESHOLD } from "@tiral/game-core"
import { formatCoins } from "@/lib/useCoins"
import { usePlayer, type Life, type LifeEvent } from "@/lib/player"
import { ActionButton, Card, ConfirmButton, EmptyState, SectionLabel, Skeleton, StatMeter, untilText } from "@/components/ui"

const STATUS_LABEL: Partial<Record<LifeEvent["status"], string>> = {
  paid: "Sent",
  refused: "Said no",
  expired: "Ignored"
}

export const STRESS_COLOR = (stress: number) => (stress >= STRESSED_THRESHOLD ? "#C2410C" : "#1E56A8")

/** Where you live, when rent is due, and how stressed you are. */
export function HomeStatusCard({ life, balance }: { life: Life; balance: number }) {
  const short = balance < life.tier.rent
  const stressed = life.stress >= STRESSED_THRESHOLD
  return (
    <Card tone={short ? "rose" : "default"}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sheet-mute">Rent</div>
          <div className="truncate text-sm font-black text-sheet-ink">{life.tier.name}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-sm font-black text-sheet-blue">{formatCoins(life.tier.rent)}</div>
          <div className={`text-[11px] ${short ? "font-bold text-flame-deep" : "text-sheet-mute"}`}>
            due {untilText(life.rentDueAt)}
          </div>
        </div>
      </div>
      {short && (
        <p className="mt-1 text-[11px] font-bold leading-snug text-flame-deep">
          You&apos;re {formatCoins(life.tier.rent - balance)} short. Miss it and you move somewhere cheaper.
        </p>
      )}
      <div className="mt-3">
        <StatMeter label="Stress" icon="😤" value={life.stress} color={STRESS_COLOR(life.stress)} />
        <p className="mt-1 text-[11px] leading-snug text-sheet-mute">
          {stressed
            ? "You're stressed: energy refills slower. Paying rent, helping family and winning races calm you down."
            : "Missed rent, ignored family and bad luck push stress up. It eases off on its own."}
        </p>
      </div>
    </Card>
  )
}

/** Family requests and life events, with Send / Not now on pending ones. */
export function MessageList({ events, empty = "Quiet for now." }: { events: LifeEvent[]; empty?: string }) {
  const { player, busy, answer } = usePlayer()
  const [notice, setNotice] = useState<string | null>(null)
  const balance = player?.balance ?? 0

  if (events.length === 0) return <EmptyState>{empty}</EmptyState>
  return (
    <>
      <ul className="flex flex-col gap-1.5">
        {events.map((event) => (
          <li
            key={event.id}
            className={`rounded-xl border px-3 py-2 ${
              event.status === "pending" ? "border-flame/40 bg-flame-soft" : "border-sheet-line bg-sheet-card"
            }`}
          >
            <div className="flex items-baseline justify-between gap-2 text-[11px] font-bold">
              <span className="text-sheet-ink">{event.from}</span>
              <span className="text-sheet-mute">
                {event.status === "pending" && event.expiresAt
                  ? `answer ${untilText(event.expiresAt)}`
                  : STATUS_LABEL[event.status] ?? ""}
              </span>
            </div>
            <p className="mt-0.5 text-xs leading-snug text-sheet-ink">{event.text}</p>
            {event.status === "pending" && (
              <div className="mt-2 flex gap-1.5">
                <ActionButton
                  variant="primary"
                  className="flex-1 text-xs"
                  disabled={busy !== null || balance < event.amount}
                  onClick={async () => {
                    setNotice(await answer(event, "pay"))
                  }}
                >
                  {busy === `event:${event.id}` ? "…" : `Send ${formatCoins(event.amount)}`}
                </ActionButton>
                <ActionButton
                  variant="ghost"
                  className="flex-1 text-xs"
                  disabled={busy !== null}
                  onClick={async () => {
                    setNotice(await answer(event, "refuse"))
                  }}
                >
                  Not now
                </ActionButton>
              </div>
            )}
          </li>
        ))}
      </ul>
      {notice && <p className="mt-2 text-xs font-bold text-flame-deep">{notice}</p>}
    </>
  )
}

export function MoveHouse({ life }: { life: Life }) {
  const { busy, moveHouse } = usePlayer()
  const [notice, setNotice] = useState<string | null>(null)
  return (
    <div>
      <SectionLabel>Move house</SectionLabel>
      <ul className="flex flex-col gap-1.5">
        {HOUSING_TIERS.map((tier) => {
          const current = tier.id === life.tier.id
          return (
            <li key={tier.id}>
              <ConfirmButton
                disabled={busy !== null || current}
                onConfirm={() => {
                  setNotice(null)
                  void moveHouse(tier.id).then(setNotice)
                }}
                confirmLabel={
                  <>
                    <span className="font-bold text-sheet-ink">Move to {tier.name}? Tap again</span>
                    <span className="font-mono font-bold text-sheet-blue">{formatCoins(tier.rent)} rent</span>
                  </>
                }
                className={`flex min-h-[44px] w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-xs transition ${
                  current ? "border-flame bg-flame-soft" : "border-sheet-line bg-sheet-card hover:bg-sheet-soft"
                }`}
                armedClassName="!border-flame !bg-flame-soft"
              >
                <span className="font-bold text-sheet-ink">
                  {tier.name}
                  {current && <span className="ml-1 text-flame-deep">· you</span>}
                </span>
                <span className="font-mono font-bold text-sheet-blue">{formatCoins(tier.rent)}</span>
              </ConfirmButton>
            </li>
          )
        })}
      </ul>
      <p className="mt-1 text-[11px] text-sheet-mute">New rent applies from your next due date.</p>
      {notice && (
        <p role="alert" className="mt-1 text-xs font-bold text-flame-deep">
          {notice}
        </p>
      )}
    </div>
  )
}

// Full life view (the Inbox page): home and stress, messages, moving house.
export function LifePanel() {
  const { player } = usePlayer()
  if (!player?.life) return <Skeleton className="h-64" />
  const { life } = player
  return (
    <div className="flex flex-col gap-4">
      <HomeStatusCard life={life} balance={player.balance} />
      <div>
        <SectionLabel>Messages</SectionLabel>
        <MessageList events={life.events} />
      </div>
      <MoveHouse life={life} />
    </div>
  )
}
