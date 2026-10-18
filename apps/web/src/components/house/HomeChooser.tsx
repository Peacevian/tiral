"use client"

import { useState } from "react"
import { HOME_CAREER, HOUSING_TIERS, RENT_PERIOD_HOURS, findTierById, homeOpenTo, type HousingTierId } from "@tiral/game-core"
import { usePlayer } from "@/lib/player"
import { formatCoins } from "@/lib/useCoins"
import { ActionButton, SectionLabel } from "@/components/ui"
import { homeLook } from "./homes"

// "Your home" on the Home page's House tab: where you live, and the other
// homes to rent. Tapping one shows its building in the scene above before you
// move (`preview`); moving changes the rent from your next due date.

export function HomeChooser({ preview, onPreview }: { preview: string | null; onPreview(home: string | null): void }) {
  const { player, busy, moveHouse } = usePlayer()
  const [notice, setNotice] = useState<string | null>(null)
  const current = player?.life?.tier.id ?? "kisenyi"
  const career = player?.career?.tier ?? "street"
  const needs = (home: string) => {
    const tier = HOME_CAREER[home as HousingTierId]
    return tier && !homeOpenTo(home, career) ? findTierById(tier).name : null
  }
  const looking = preview ?? current
  const chosen = HOUSING_TIERS.find((tier) => tier.id === looking) ?? HOUSING_TIERS[0]
  const look = homeLook(looking)
  const days = RENT_PERIOD_HOURS / 24
  return (
    <div>
      <SectionLabel>Your home</SectionLabel>
      <ul className="flex flex-col gap-1.5">
        {HOUSING_TIERS.map((tier) => {
          const mine = tier.id === current
          const showing = tier.id === looking
          return (
            <li key={tier.id}>
              <button
                type="button"
                aria-pressed={showing}
                onClick={() => {
                  setNotice(null)
                  onPreview(mine ? null : tier.id)
                }}
                className={`flex min-h-[48px] w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm transition ${
                  showing ? "border-flame bg-flame-soft" : "border-sheet-line bg-sheet-card hover:bg-sheet-soft"
                }`}
              >
                <span className="min-w-0">
                  <span className="block font-bold text-sheet-ink">
                    {tier.name}
                    {mine && <span className="ml-1 text-xs text-flame-deep">· you live here</span>}
                  </span>
                  <span className="block text-[11px] text-sheet-mute">
                    {needs(tier.id) ? `🔒 ${needs(tier.id)} owners` : `${homeLook(tier.id).room}×${homeLook(tier.id).room} room`}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-xs font-bold text-sheet-blue">{formatCoins(tier.rent)}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <div className="mt-2 rounded-xl border border-sheet-line bg-sheet-card p-3">
        <div className="text-sm font-black text-sheet-ink">{chosen.name}</div>
        <p className="mt-0.5 text-xs text-sheet-mute">{look.blurb}.</p>
        <p className="mt-1 text-xs text-sheet-mute">
          Rent <span className="font-mono font-bold text-sheet-blue">{formatCoins(chosen.rent)}</span> every {days} days
        </p>
        {looking !== current ? (
          <div className="mt-2 flex gap-2">
            <ActionButton variant="sheet-outline" className="flex-1" onClick={() => onPreview(null)}>
              Back to my home
            </ActionButton>
            <ActionButton
              variant="flame"
              className="flex-[2]"
              disabled={busy !== null || needs(chosen.id) !== null}
              onClick={() => {
                setNotice(null)
                void moveHouse(chosen.id).then((error) => {
                  if (error) setNotice(error)
                  else onPreview(null)
                })
              }}
            >
              {needs(chosen.id) ? `🔒 ${needs(chosen.id)} only` : busy?.startsWith("move:") ? "Moving…" : `Move here · ${formatCoins(chosen.rent)}`}
            </ActionButton>
          </div>
        ) : (
          <p className="mt-1 text-[11px] text-sheet-mute">Tap another home to look at it before you move.</p>
        )}
        {notice && (
          <p role="alert" className="mt-1 text-xs font-bold text-flame-deep">
            {notice}
          </p>
        )}
        <p className="mt-1 text-[11px] text-sheet-mute">New rent applies from your next due date. Your furniture comes with you (a boda, pickup or lorry: 15,000–180,000); what doesn&apos;t fit a smaller home goes into storage.</p>
      </div>
    </div>
  )
}
