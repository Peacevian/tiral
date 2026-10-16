"use client"

import { colorName } from "@/lib/colorName"
import { useMemo, useState } from "react"
import {
  FLOOR_COLORS,
  FLOOR_MATERIALS,
  FURNITURE,
  FURNITURE_BY_ID,
  MAX_ITEMS,
  ROOF_COLORS,
  ROOF_MATERIALS,
  ROOM_GRID,
  ROTATIONS,
  TRIM_COLORS,
  WALL_COLORS,
  WALL_MATERIALS,
  isValidHouseLoadout,
  type FloorMaterial,
  type FurnitureId,
  type HouseLoadout,
  type PlacedItem,
  type RoofMaterial,
  type Rotation,
  type WallMaterial
} from "@tiral/houses"

function itemDims(item: PlacedItem): { w: number; d: number } {
  const spec = FURNITURE_BY_ID[item.item]
  const swapped = item.rot === 90 || item.rot === 270
  return swapped ? { w: spec.depth, d: spec.width } : { w: spec.width, d: spec.depth }
}

function cells(item: PlacedItem): string[] {
  const { w, d } = itemDims(item)
  const out: string[] = []
  for (let x = item.x; x < item.x + w; x++) {
    for (let z = item.z; z < item.z + d; z++) {
      out.push(`${x},${z}`)
    }
  }
  return out
}

function overlaps(items: PlacedItem[], candidate: PlacedItem): boolean {
  const occupied = new Set<string>()
  for (const item of items) {
    if (item.id === candidate.id) continue
    for (const cell of cells(item)) occupied.add(cell)
  }
  return cells(candidate).some((cell) => occupied.has(cell))
}

function findFreeSpot(items: PlacedItem[], furniture: FurnitureId): PlacedItem | null {
  const spec = FURNITURE_BY_ID[furniture]
  for (const rot of ROTATIONS) {
    const probe = { id: "probe", item: furniture, x: 0, z: 0, rot, color: spec.colors[0] as string }
    const { w, d } = itemDims(probe)
    for (let z = 0; z + d <= ROOM_GRID; z++) {
      for (let x = 0; x + w <= ROOM_GRID; x++) {
        const candidate = { ...probe, x, z }
        if (!overlaps(items, candidate)) return candidate
      }
    }
  }
  return null
}

function Chip({
  label,
  active,
  onClick
}: {
  label: string
  active: boolean
  onClick(): void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[44px] rounded-lg border px-3 py-2 text-sm font-bold capitalize transition ${
        active
          ? "border-flame bg-flame-soft text-flame-deep"
          : "border-sheet-line bg-sheet-card text-sheet-ink hover:bg-sheet-soft"
      }`}
    >
      {label}
    </button>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-sheet-mute">{label}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

function Swatches({
  colors,
  selected,
  onSelect
}: {
  colors: readonly string[]
  selected: string
  onSelect(color: string): void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onSelect(color)}
          aria-label={colorName(color)}
          aria-pressed={selected === color}
          title={colorName(color)}
          className={`inline-flex h-11 w-11 items-center justify-center rounded-full border-2 transition ${
            selected === color ? "scale-110 border-flame" : "border-sheet-line hover:border-sheet-handle"
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
  )
}

export function HouseCustomizer({
  house,
  onChange
}: {
  house: HouseLoadout
  onChange(next: HouseLoadout): void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = useMemo(
    () => house.items.find((item) => item.id === selectedId) ?? null,
    [house.items, selectedId]
  )

  const occupied = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of house.items) {
      for (const cell of cells(item)) map.set(cell, item.id)
    }
    return map
  }, [house.items])

  function commit(next: HouseLoadout, keepSelectedId?: string | null) {
    if (!isValidHouseLoadout(next)) return
    onChange(next)
    if (keepSelectedId !== undefined) setSelectedId(keepSelectedId)
  }

  function setColor(patch: Partial<HouseLoadout["colors"]>) {
    commit({ ...house, colors: { ...house.colors, ...patch } })
  }

  function addFurniture(furniture: FurnitureId) {
    if (house.items.length >= MAX_ITEMS) return
    const spot = findFreeSpot(house.items, furniture)
    if (!spot) return
    const id = `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
    commit({ ...house, items: [...house.items, { ...spot, id }] }, id)
  }

  function updateSelected(next: PlacedItem) {
    commit(
      { ...house, items: house.items.map((item) => (item.id === next.id ? next : item)) },
      next.id
    )
  }

  function removeSelected() {
    if (!selected) return
    commit({ ...house, items: house.items.filter((item) => item.id !== selected.id) }, null)
  }

  function moveSelected(dx: number, dz: number) {
    if (!selected) return
    updateSelected({ ...selected, x: selected.x + dx, z: selected.z + dz })
  }

  function rotateSelected() {
    if (!selected) return
    const nextRot = (((selected.rot + 90) % 360) as Rotation)
    updateSelected({ ...selected, rot: nextRot })
  }

  return (
    <div className="flex flex-col gap-4">
      <Group label="Wall material">
        {WALL_MATERIALS.map((material) => (
          <Chip
            key={material}
            label={material}
            active={house.wallMaterial === material}
            onClick={() => commit({ ...house, wallMaterial: material as WallMaterial })}
          />
        ))}
      </Group>

      <Group label="Floor material">
        {FLOOR_MATERIALS.map((material) => (
          <Chip
            key={material}
            label={material}
            active={house.floorMaterial === material}
            onClick={() => commit({ ...house, floorMaterial: material as FloorMaterial })}
          />
        ))}
      </Group>

      <Group label="Roof material">
        {ROOF_MATERIALS.map((material) => (
          <Chip
            key={material}
            label={material}
            active={house.roofMaterial === material}
            onClick={() => commit({ ...house, roofMaterial: material as RoofMaterial })}
          />
        ))}
      </Group>

      <div className="grid grid-cols-2 gap-4">
        <Group label="Wall paint">
          <Swatches colors={WALL_COLORS} selected={house.colors.wall} onSelect={(wall) => setColor({ wall })} />
        </Group>
        <Group label="Floor tone">
          <Swatches colors={FLOOR_COLORS} selected={house.colors.floor} onSelect={(floor) => setColor({ floor })} />
        </Group>
        <Group label="Roof color">
          <Swatches colors={ROOF_COLORS} selected={house.colors.roof} onSelect={(roof) => setColor({ roof })} />
        </Group>
        <Group label="Trim">
          <Swatches colors={TRIM_COLORS} selected={house.colors.trim} onSelect={(trim) => setColor({ trim })} />
        </Group>
      </div>

      <Group label="Add furniture">
        {FURNITURE.map((furniture) => (
          <Chip
            key={furniture.id}
            label={furniture.label}
            active={false}
            onClick={() => addFurniture(furniture.id)}
          />
        ))}
      </Group>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-sheet-mute">
            Layout · {house.items.length}/{MAX_ITEMS}
          </div>
          {selected && (
            <button
              type="button"
              onClick={removeSelected}
              className="min-h-[44px] rounded-lg border border-flame-deep/40 px-3 text-xs font-bold text-flame-deep"
            >
              Remove {FURNITURE_BY_ID[selected.item].label}
            </button>
          )}
        </div>

        <div className="relative w-full overflow-hidden rounded-xl border border-sheet-line bg-sheet-soft p-1">
          <div
            className="grid aspect-square w-full"
            style={{ gridTemplateColumns: `repeat(${ROOM_GRID}, 1fr)`, gridTemplateRows: `repeat(${ROOM_GRID}, 1fr)` }}
          >
            {Array.from({ length: ROOM_GRID * ROOM_GRID }, (_, index) => {
              const x = index % ROOM_GRID
              const z = Math.floor(index / ROOM_GRID)
              const owner = occupied.get(`${x},${z}`)
              return (
                <div
                  key={index}
                  className={`border border-sheet-line ${owner ? "" : "bg-sheet-card"}`}
                />
              )
            })}
          </div>
          {house.items.map((item) => {
            const { w, d } = itemDims(item)
            const isSelected = item.id === selectedId
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={`absolute flex items-center justify-center rounded-md text-[11px] font-bold text-sheet-ink transition ${
                  isSelected ? "ring-2 ring-flame" : "ring-1 ring-sheet-line"
                }`}
                style={{
                  left: `calc(${(item.x / ROOM_GRID) * 100}% + 4px)`,
                  top: `calc(${(item.z / ROOM_GRID) * 100}% + 4px)`,
                  width: `calc(${(w / ROOM_GRID) * 100}% - 8px)`,
                  height: `calc(${(d / ROOM_GRID) * 100}% - 8px)`,
                  backgroundColor: item.color
                }}
              >
                <span className="truncate px-0.5">{FURNITURE_BY_ID[item.item].label}</span>
              </button>
            )
          })}
        </div>

        {selected ? (
          <div className="mt-3 flex flex-col gap-3 rounded-xl border border-sheet-line bg-sheet-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-sheet-mute">Move</span>
              {[
                { label: "↑", name: "Move back", dx: 0, dz: -1 },
                { label: "↓", name: "Move forward", dx: 0, dz: 1 },
                { label: "←", name: "Move left", dx: -1, dz: 0 },
                { label: "→", name: "Move right", dx: 1, dz: 0 }
              ].map((step) => (
                <button
                  key={step.label}
                  type="button"
                  aria-label={step.name}
                  title={step.name}
                  onClick={() => moveSelected(step.dx, step.dz)}
                  className="h-11 w-11 rounded-lg border border-sheet-line bg-sheet-card text-sm font-bold text-sheet-ink hover:bg-sheet-soft"
                >
                  {step.label}
                </button>
              ))}
              <button
                type="button"
                onClick={rotateSelected}
                className="min-h-[44px] rounded-lg border border-sheet-line bg-sheet-card px-3 text-xs font-bold text-sheet-ink hover:bg-sheet-soft"
              >
                ⟳ Rotate
              </button>
            </div>
            <Group label="Item color">
              <Swatches
                colors={FURNITURE_BY_ID[selected.item].colors}
                selected={selected.color}
                onSelect={(color) => updateSelected({ ...selected, color })}
              />
            </Group>
          </div>
        ) : (
          <div className="mt-3 text-center text-xs text-sheet-mute">
            Tap a piece in the grid to move, rotate, recolour or remove it.
          </div>
        )}
      </div>
    </div>
  )
}
