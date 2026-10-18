"use client"

import { useState } from "react"
import { FURNITURE, FURNITURE_GRADES, GRADE_INFO, furniturePrice, type FurnitureGrade, type FurnitureId } from "@tiral/houses"
import { usePlayer } from "@/lib/player"
import { formatCoins } from "@/lib/useCoins"
import { colorName } from "@/lib/colorName"
import type { OwnedItem } from "@/lib/useHouseItems"

// Buying furniture: pick a market (Owino basic, Kikuubo good, Acacia Mall
// luxury), a piece and its colour. It arrives in your things, ready to place.

const COMFORT_NOTE: Partial<Record<FurnitureId, string>> = {
  bed: "Rest at home refills energy faster (no bed: slower)",
  sofa: "Stress fades faster",
  television: "Stress fades faster"
}

export function FurnitureShop({
  busy,
  onBuy
}: {
  busy: string | null
  onBuy(item: FurnitureId, grade: FurnitureGrade, color: string): Promise<OwnedItem | string>
}) {
  const { player } = usePlayer()
  const balance = player?.balance ?? 0
  const [grade, setGrade] = useState<FurnitureGrade>("owino")
  const [colors, setColors] = useState<Partial<Record<FurnitureId, string>>>({})
  const [notice, setNotice] = useState<{ text: string; good: boolean } | null>(null)
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-sheet-mute">Buy furniture</div>
      <div className="flex gap-1.5" role="group" aria-label="Market">
        {FURNITURE_GRADES.map((candidate) => (
          <button
            key={candidate}
            type="button"
            aria-pressed={grade === candidate}
            onClick={() => setGrade(candidate)}
            className={`min-h-[44px] flex-1 rounded-lg border px-2 text-xs font-black transition ${
              grade === candidate ? "border-flame bg-flame text-white" : "border-sheet-line bg-sheet-card text-sheet-ink"
            }`}
          >
            {GRADE_INFO[candidate].market}
            <span className="block text-[10px] font-bold opacity-80">{GRADE_INFO[candidate].label}</span>
          </button>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-sheet-mute">{GRADE_INFO[grade].blurb}.</p>
      {notice && (
        <p role="status" className={`mt-2 rounded-lg px-3 py-2 text-xs font-bold ${notice.good ? "bg-leaf-soft text-leaf" : "bg-flame-soft text-flame-deep"}`}>
          {notice.text}
        </p>
      )}
      <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {FURNITURE.map((spec) => {
          const price = furniturePrice(spec.id, grade)
          const color = colors[spec.id] ?? spec.colors[0]!
          const buying = busy === `buy:${spec.id}:${grade}`
          return (
            <li key={spec.id} className="rounded-xl border border-sheet-line bg-sheet-card p-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-black text-sheet-ink">{spec.label}</span>
                <span className="font-mono text-xs font-bold text-sheet-blue">{formatCoins(price)}</span>
              </div>
              <div className="text-[11px] text-sheet-mute">
                {spec.width}×{spec.depth} squares{COMFORT_NOTE[spec.id] ? ` · ${COMFORT_NOTE[spec.id]}` : ""}
              </div>
              <div className="mt-1.5 flex items-center gap-1">
                {spec.colors.map((candidate) => (
                  <button
                    key={candidate}
                    type="button"
                    onClick={() => setColors((current) => ({ ...current, [spec.id]: candidate }))}
                    aria-label={colorName(candidate)}
                    aria-pressed={color === candidate}
                    className={`h-8 w-8 rounded-full border-2 ${color === candidate ? "border-flame" : "border-sheet-line"}`}
                    style={{ backgroundColor: candidate }}
                  />
                ))}
                <button
                  type="button"
                  disabled={busy !== null || balance < price}
                  onClick={() => {
                    setNotice(null)
                    void onBuy(spec.id, grade, color).then((result) =>
                      setNotice(
                        typeof result === "string"
                          ? { text: result, good: false }
                          : { text: `Bought: ${GRADE_INFO[grade].label.toLowerCase()} ${spec.label.toLowerCase()}. It's in your things below: tap it to place it.`, good: true }
                      )
                    )
                  }}
                  className="ml-auto min-h-[36px] rounded-lg bg-flame px-3 text-xs font-black text-white disabled:opacity-40"
                >
                  {buying ? "Buying…" : "Buy"}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
