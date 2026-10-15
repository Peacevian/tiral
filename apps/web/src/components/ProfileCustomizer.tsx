"use client"

import { colorName, skinToneName } from "@/lib/colorName"
import {
  BACKPACK_COLORS,
  GLASSES_STYLES,
  HAIR_COLORS,
  HAIR_STYLES,
  HAT_COLORS,
  HAT_STYLES,
  OUTFITS,
  PANTS_COLORS,
  RARITY_COLORS,
  SHIRT_COLORS,
  SHOE_COLORS,
  SKIN_TONES,
  TRAILS,
  itemRarity,
  resolveLoadout,
  type AvatarLoadout
} from "@tiral/avatars"

type RaritySlot = Parameters<typeof itemRarity>[0]

const OPTION_LABELS: Record<string, string> = {
  bodavest: "Boda vest",
  cranes: "Cranes kit",
  headwrap: "Head wrap",
  none: "None"
}

function optionLabel(id: string) {
  return OPTION_LABELS[id] ?? id.charAt(0).toUpperCase() + id.slice(1)
}

function Options<T extends string>({
  label,
  slot,
  options,
  selected,
  onSelect,
  hint
}: {
  label: string
  slot: RaritySlot
  options: readonly T[]
  selected: T
  onSelect(option: T): void
  hint?: string
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
        {label}
        {hint && <span className="normal-case tracking-normal text-slate-400">{hint}</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const rarity = itemRarity(slot, option)
          return (
            <button
              key={option}
              type="button"
              onClick={() => onSelect(option)}
              aria-pressed={selected === option}
              title={`${optionLabel(option)} · ${rarity}`}
              className={`flex min-h-[44px] items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-bold transition ${
                selected === option
                  ? "border-amber-300 bg-amber-300/20 text-amber-100"
                  : "border-white/15 bg-white/5 text-slate-200 hover:bg-white/10"
              }`}
            >
              {rarity !== "common" && (
                <span
                  aria-label={rarity}
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: RARITY_COLORS[rarity], boxShadow: `0 0 6px ${RARITY_COLORS[rarity]}` }}
                />
              )}
              {optionLabel(option)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Swatches({
  label,
  colors,
  selected,
  onSelect,
  nameOf = colorName
}: {
  label: string
  colors: readonly string[]
  selected: string
  onSelect(color: string): void
  /** How to name a colour for screen readers and tooltips (default: its hue). */
  nameOf?: (color: string, index: number) => string
}) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {colors.map((color, index) => (
          <button
            key={color}
            type="button"
            onClick={() => onSelect(color)}
            aria-label={`${label}: ${nameOf(color, index)}`}
            aria-pressed={selected === color}
            title={nameOf(color, index)}
            className={`inline-flex h-11 w-11 items-center justify-center rounded-full border-2 transition ${
              selected === color
                ? "scale-110 border-amber-300"
                : "border-white/20 hover:border-white/50"
            }`}
            style={{ backgroundColor: color }}
          >
            {selected === color && (
              <span aria-hidden className="text-base font-black text-white [text-shadow:0_0_3px_#000,0_0_2px_#000]">
                ✓
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

export function ProfileCustomizer({
  loadout,
  onChange
}: {
  loadout: AvatarLoadout
  onChange(next: AvatarLoadout): void
}) {
  const resolved = resolveLoadout(loadout)
  return (
    <div className="flex flex-col gap-4">
      <Swatches
        label="Skin"
        colors={SKIN_TONES}
        nameOf={(color, index) => `${skinToneName(color)} (${index + 1} of ${SKIN_TONES.length})`}
        selected={loadout.skin}
        onSelect={(skin) => onChange({ ...loadout, skin })}
      />
      <Options
        label="Outfit"
        slot="outfit"
        options={OUTFITS}
        selected={resolved.outfit}
        onSelect={(outfit) => onChange({ ...loadout, outfit })}
      />
      <Swatches
        label={resolved.outfit === "cranes" || resolved.outfit === "bodavest" ? "Shirt (under / trim)" : resolved.outfit === "kanzu" ? "Embroidery" : "Outfit color"}
        colors={SHIRT_COLORS}
        selected={loadout.shirt}
        onSelect={(shirt) => onChange({ ...loadout, shirt })}
      />
      <Options
        label="Hair"
        slot="hair"
        options={HAIR_STYLES}
        selected={resolved.hair}
        onSelect={(hair) => onChange({ ...loadout, hair })}
      />
      {resolved.hair !== "bald" && (
        <Swatches
          label="Hair color"
          colors={HAIR_COLORS}
          selected={resolved.hairColor}
          onSelect={(hairColor) => onChange({ ...loadout, hairColor })}
        />
      )}
      <Swatches
        label="Pants"
        colors={PANTS_COLORS}
        selected={loadout.pants}
        onSelect={(pants) => onChange({ ...loadout, pants })}
      />
      <Options
        label="Hat"
        slot="hat"
        options={HAT_STYLES}
        selected={loadout.hat}
        onSelect={(hat) => onChange({ ...loadout, hat })}
      />
      {loadout.hat !== "none" && (
        <Swatches
          label="Hat color"
          colors={HAT_COLORS}
          selected={loadout.hatColor}
          onSelect={(hatColor) => onChange({ ...loadout, hatColor })}
        />
      )}
      <Swatches
        label="Backpack"
        colors={BACKPACK_COLORS}
        selected={loadout.backpack}
        onSelect={(backpack) => onChange({ ...loadout, backpack })}
      />
      <Options
        label="Glasses"
        slot="glasses"
        options={GLASSES_STYLES}
        selected={resolved.glasses}
        onSelect={(glasses) => onChange({ ...loadout, glasses })}
      />
      <Swatches
        label="Shoes"
        colors={SHOE_COLORS}
        selected={resolved.shoes}
        onSelect={(shoes) => onChange({ ...loadout, shoes })}
      />
      <Options
        label="Running trail"
        slot="trail"
        options={TRAILS}
        selected={resolved.trail}
        onSelect={(trail) => onChange({ ...loadout, trail })}
        hint="shows behind you in races"
      />
    </div>
  )
}
