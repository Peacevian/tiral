"use client"

import Link from "next/link"

// Slim top HUD over the full-bleed home scene.
export function HomeHud({
  displayName,
  dirty,
  saving,
  notice,
  onSave
}: {
  displayName: string
  dirty: boolean
  saving: boolean
  notice: string | null
  onSave(): void
}) {
  return (
    <div className="absolute inset-x-0 top-0 z-20 px-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pt-[max(0.5rem,env(safe-area-inset-top))]">
      <div className="flex min-h-[48px] items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href="/play"
            aria-label="Back to the game"
            className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/80 text-lg font-black text-slate-200 shadow-xl backdrop-blur-md"
          >
            ←
          </Link>
          <div className="max-w-[46vw] truncate rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm font-black text-white shadow-xl backdrop-blur-md">
            🏠 {displayName}&rsquo;s home
          </div>
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !dirty}
          className="relative inline-flex min-h-[44px] shrink-0 items-center rounded-2xl bg-amber-400 px-5 text-sm font-black text-slate-950 shadow-xl transition hover:bg-amber-300 disabled:opacity-40"
        >
          {dirty && (
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500" aria-hidden />
          )}
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {notice && (
        <div className="mx-auto mt-1.5 w-fit max-w-full truncate rounded-xl bg-slate-950/85 px-3 py-1.5 text-xs font-bold text-slate-200 shadow-xl backdrop-blur-md">
          {notice}
        </div>
      )}
    </div>
  )
}
