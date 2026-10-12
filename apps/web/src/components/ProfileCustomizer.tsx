"use client"

import {
  BACKPACK_COLORS,
  GLASSES_STYLES,
  HAT_COLORS,
  HAT_STYLES,
  PANTS_COLORS,
  SHIRT_COLORS,
  SHOE_COLORS,
  SKIN_TONES,
  resolveLoadout,
  type AvatarLoadout,
  type GlassesStyle,
  type HatStyle
} from "@tiral/avatars"

function Swatches({
  label,
  colors,
  selected,
  onSelect
}: {
  label: string
  colors: readonly string[]
  selected: string
  onSelect(color: string): void
}) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
        {label}
      </div>
      <div className="flex flex-wrap gap-2">
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onSelect(color)}
            aria-label={`${label} ${color}`}
            className={`h-9 w-9 rounded-full border-2 transition ${
              selected === color
                ? "scale-110 border-amber-300"
                : "border-white/20 hover:border-white/50"
            }`}
            style={{ backgroundColor: color }}
          />
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
        selected={loadout.skin}
        onSelect={(skin) => onChange({ ...loadout, skin })}
      />
      <Swatches
        label="Shirt"
        colors={SHIRT_COLORS}
        selected={loadout.shirt}
        onSelect={(shirt) => onChange({ ...loadout, shirt })}
      />
      <Swatches
        label="Pants"
        colors={PANTS_COLORS}
        selected={loadout.pants}
        onSelect={(pants) => onChange({ ...loadout, pants })}
      />
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
          Hat
        </div>
        <div className="flex flex-wrap gap-2">
          {HAT_STYLES.map((style: HatStyle) => (
            <button
              key={style}
              type="button"
              onClick={() => onChange({ ...loadout, hat: style })}
              className={`rounded-lg border px-3 py-2 text-sm font-bold capitalize transition ${
                loadout.hat === style
                  ? "border-amber-300 bg-amber-300/20 text-amber-100"
                  : "border-white/15 bg-white/5 text-slate-200 hover:bg-white/10"
              }`}
            >
              {style}
            </button>
          ))}
        </div>
      </div>
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
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
          Glasses
        </div>
        <div className="flex flex-wrap gap-2">
          {GLASSES_STYLES.map((style: GlassesStyle) => (
            <button
              key={style}
              type="button"
              onClick={() => onChange({ ...loadout, glasses: style })}
              className={`rounded-lg border px-3 py-2 text-sm font-bold capitalize transition ${
                resolved.glasses === style
                  ? "border-amber-300 bg-amber-300/20 text-amber-100"
                  : "border-white/15 bg-white/5 text-slate-200 hover:bg-white/10"
              }`}
            >
              {style}
            </button>
          ))}
        </div>
      </div>
      <Swatches
        label="Shoes"
        colors={SHOE_COLORS}
        selected={resolved.shoes}
        onSelect={(shoes) => onChange({ ...loadout, shoes })}
      />
    </div>
  )
}
