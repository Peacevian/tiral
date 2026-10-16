"use client"

import { KAMPALA_ZONE } from "@tiral/game-core"

type StartPickerProps = {
  players: Record<string, { startPointId: string | null }>
  ownSessionId: string | null
  locked: boolean
  onSelect(startPointId: string): void
}

export function StartPicker({ players, ownSessionId, locked, onSelect }: StartPickerProps) {
  const takenByOther = new Map<string, boolean>()
  for (const [sessionId, player] of Object.entries(players)) {
    if (player.startPointId && sessionId !== ownSessionId) {
      takenByOther.set(player.startPointId, true)
    }
  }
  const ownStartId = ownSessionId ? players[ownSessionId]?.startPointId ?? null : null

  return (
    <div className="rounded-2xl border border-sheet-line bg-sheet-card/95 p-3 text-sheet-ink shadow-2xl md:backdrop-blur-md">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-flame-deep">
        {locked ? "Positions locked" : "Choose your start"}
      </div>
      <div className="flex flex-col gap-2">
        {KAMPALA_ZONE.startPoints.map((point) => {
          const taken = takenByOther.get(point.id) === true
          const selected = ownStartId === point.id
          return (
            <button
              key={point.id}
              type="button"
              disabled={locked || taken}
              onClick={() => onSelect(point.id)}
              className={`rounded-xl border px-3 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
                selected
                  ? "border-flame bg-flame-soft text-flame-deep"
                  : "border-sheet-line bg-sheet-card text-sheet-ink hover:bg-sheet-line"
              }`}
            >
              <span className="font-bold">{point.name}</span>
              {taken && <span className="ml-2 text-xs text-sheet-mute">taken</span>}
              {selected && <span className="ml-2 text-xs text-flame-deep">you</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
