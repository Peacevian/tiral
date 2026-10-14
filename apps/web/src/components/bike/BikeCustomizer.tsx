"use client"

import type { ReactNode } from "react"
import {
  BIKE_PAINTS,
  GRIP_COLORS,
  MUDFLAP_SLOGANS,
  SEAT_COVERS,
  UNDERGLOW_COLORS,
  findBikeItem,
  findBikeModel,
  type BikeItemRarity,
  type BikeLook
} from "@tiral/game-core"
import { formatCoins } from "@/lib/useCoins"
import { SectionLabel } from "@/components/ui"

const RARITY_DOT: Record<BikeItemRarity, string> = {
  common: "bg-sky-400",
  rare: "bg-violet-400",
  epic: "bg-amber-400"
}

/** "owned" / "free" / "15,000" for an option's item id (null = free default). */
function PriceTag({ itemId, owned }: { itemId: string | null; owned: ReadonlySet<string> }) {
  if (itemId === null) return <span className="text-[10px] text-slate-500">free</span>
  if (owned.has(itemId)) return <span className="text-[10px] font-bold text-emerald-300">owned</span>
  const item = findBikeItem(itemId)
  if (!item) return null
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold text-amber-200">
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${RARITY_DOT[item.rarity]}`} />
      {formatCoins(item.price)}
    </span>
  )
}

function Option({
  selected,
  onClick,
  children,
  itemId,
  owned,
  label
}: {
  selected: boolean
  onClick(): void
  children: ReactNode
  itemId: string | null
  owned: ReadonlySet<string>
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={label}
      title={label}
      className={`flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-xl border px-2 py-1.5 text-center transition ${
        selected ? "border-amber-300 bg-amber-300/10" : "border-white/10 bg-white/5 hover:bg-white/10"
      }`}
    >
      {children}
      <PriceTag itemId={itemId} owned={owned} />
    </button>
  )
}

function Swatch({ color }: { color: string }) {
  return <span aria-hidden className="h-6 w-6 rounded-full border border-white/30" style={{ background: color }} />
}

// Pick paint, seat cover, mudflap slogan, grips and extras. Every change shows
// on the big 3D bike straight away; nothing is bought until you apply.
export function BikeCustomizer({
  look,
  owned,
  onChange
}: {
  look: BikeLook
  owned: ReadonlySet<string>
  onChange(look: BikeLook): void
}) {
  const set = (patch: Partial<BikeLook>) => onChange({ ...look, ...patch })
  const factory = findBikeModel(look.model).build.paint

  return (
    <div className="flex flex-col gap-4">
      <div>
        <SectionLabel>Paint</SectionLabel>
        <div className="grid grid-cols-4 gap-1.5">
          {BIKE_PAINTS.map((paint) => (
            <Option
              key={paint.id}
              selected={look.paint === paint.id}
              onClick={() => set({ paint: paint.id })}
              itemId={paint.color === null ? null : `paint:${paint.id}`}
              owned={owned}
              label={paint.name}
            >
              <Swatch color={paint.color ?? factory} />
            </Option>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Seat cover</SectionLabel>
        <div className="grid grid-cols-2 gap-1.5">
          {SEAT_COVERS.map((seat) => (
            <Option
              key={seat.id}
              selected={look.seat === seat.id}
              onClick={() => set({ seat: seat.id })}
              itemId={seat.id === "plain" ? null : `seat:${seat.id}`}
              owned={owned}
              label={seat.name}
            >
              <span className="flex items-center gap-1.5 text-xs font-bold text-white">
                <Swatch color={seat.color} />
                {seat.name}
              </span>
            </Option>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Mudflap slogan</SectionLabel>
        <div className="grid grid-cols-2 gap-1.5">
          <Option selected={look.slogan === null} onClick={() => set({ slogan: null })} itemId={null} owned={owned} label="Plain flap">
            <span className="text-xs font-bold text-slate-300">Plain</span>
          </Option>
          {MUDFLAP_SLOGANS.map((slogan, index) => (
            <Option
              key={slogan}
              selected={look.slogan === index}
              onClick={() => set({ slogan: index })}
              itemId={`slogan:${index}`}
              owned={owned}
              label={slogan}
            >
              <span className="text-xs font-black uppercase text-amber-200">{slogan}</span>
            </Option>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Grips</SectionLabel>
        <div className="grid grid-cols-6 gap-1.5">
          {GRIP_COLORS.map((color) => (
            <Option
              key={color}
              selected={look.grips === color}
              onClick={() => set({ grips: color })}
              itemId={color === "#111827" ? null : `grips:${color}`}
              owned={owned}
              label="Grip colour"
            >
              <Swatch color={color} />
            </Option>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Extras</SectionLabel>
        <div className="grid grid-cols-3 gap-1.5">
          {(
            [
              ["tassels", "Tassels", "🎀"],
              ["rack", "Carrier rack", "🧺"],
              ["crashBars", "Crash bars", "🛡"]
            ] as const
          ).map(([key, name, icon]) => (
            <Option
              key={key}
              selected={look[key]}
              onClick={() => set({ [key]: !look[key] })}
              itemId={`extra:${key}`}
              owned={owned}
              label={name}
            >
              <span className="text-xs font-bold text-white">
                <span aria-hidden>{icon}</span> {name}
              </span>
            </Option>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Underglow</SectionLabel>
        <div className="grid grid-cols-5 gap-1.5">
          <Option selected={look.underglow === null} onClick={() => set({ underglow: null })} itemId={null} owned={owned} label="No underglow">
            <span className="text-xs font-bold text-slate-300">Off</span>
          </Option>
          {UNDERGLOW_COLORS.map((glow) => (
            <Option
              key={glow.color}
              selected={look.underglow === glow.color}
              onClick={() => set({ underglow: glow.color })}
              itemId={`underglow:${glow.color}`}
              owned={owned}
              label={`${glow.name} underglow`}
            >
              <Swatch color={glow.color} />
            </Option>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-slate-400">
        Buy a part once and use it on any of your bikes. Looks only: parts never change speed or pay.
      </p>
    </div>
  )
}
