"use client"

import { useState } from "react"
import { ConfirmButton } from "@/components/ui"

// Slim top HUD over the full-bleed home scene.
export function HomeHud({
  displayName,
  dirty,
  saving,
  notice,
  onSave,
  onReset,
  showRoof,
  onToggleRoof
}: {
  displayName: string
  dirty: boolean
  saving: boolean
  notice: string | null
  onSave(): void
  onReset(): void
  showRoof: boolean
  onToggleRoof(): void
}) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="absolute inset-x-0 top-0 z-20 px-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pt-2">
      <div className="flex min-h-[48px] items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="max-w-[45vw] truncate rounded-2xl border border-sheet-line bg-sheet-card/95 px-3 py-2 text-xs font-black text-sheet-ink shadow-xl md:backdrop-blur-md sm:max-w-none sm:text-sm">
            🏠 {displayName}&rsquo;s home
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !dirty}
            className="relative inline-flex min-h-[44px] shrink-0 items-center rounded-2xl bg-flame px-4 text-sm font-black text-white shadow-xl transition hover:bg-flame-dark disabled:opacity-40 sm:px-5"
          >
            {dirty && (
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-flame-deep" aria-hidden />
            )}
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="More actions"
            aria-expanded={menuOpen}
            className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-2xl border border-sheet-line bg-sheet-card/95 text-lg font-black text-sheet-ink shadow-xl md:backdrop-blur-md"
          >
            ⋯
          </button>
        </div>
      </div>
      {menuOpen && (
        <div className="ml-auto mt-1.5 flex w-[min(78vw,260px)] flex-col gap-1 rounded-2xl border border-sheet-line bg-sheet p-2 shadow-2xl md:backdrop-blur-md">
          <button
            type="button"
            onClick={onToggleRoof}
            className="min-h-[44px] rounded-xl bg-sheet-card px-3 text-left text-sm font-bold text-sheet-ink"
          >
            {showRoof ? "Hide roof" : "Show roof"}
          </button>
          <ConfirmButton
            onConfirm={() => {
              setMenuOpen(false)
              onReset()
            }}
            confirmLabel="Tap again to undo all unsaved changes"
            disabled={!dirty || saving}
            className="min-h-[44px] rounded-xl bg-sheet-card px-3 text-left text-sm font-bold text-sheet-ink disabled:opacity-40"
            armedClassName="!bg-flame-deep !text-white"
          >
            Reset changes
          </ConfirmButton>
        </div>
      )}
      {notice && (
        <div className="mx-auto mt-1.5 w-fit max-w-full truncate rounded-xl bg-sheet-card/95 px-3 py-1.5 text-xs font-bold text-sheet-ink shadow-xl md:backdrop-blur-md">
          {notice}
        </div>
      )}
    </div>
  )
}
