"use client"

import type { ReactNode } from "react"

export type HomeSheetTab = "avatar" | "house" | "room"

const TABS: { id: HomeSheetTab; label: string }[] = [
  { id: "avatar", label: "🧍 Avatar" },
  { id: "house", label: "🏠 House" },
  { id: "room", label: "📋 Room" }
]

// Collapsible bottom sheet ordinaria: tab row is always visible (tap selects
// and opens, tap active collapses); content scrolls internally.
export function HomeSheet({
  tab,
  onTab,
  open,
  onToggle,
  avatar,
  house,
  room
}: {
  tab: HomeSheetTab
  onTab(tab: HomeSheetTab): void
  open: boolean
  onToggle(): void
  avatar: ReactNode
  house: ReactNode
  room: ReactNode
}) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-20 px-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pb-[max(0.5rem,env(safe-area-inset-bottom))] max-md:pb-[calc(4rem+env(safe-area-inset-bottom))]">
      <div className="mx-auto w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-slate-950/90 shadow-2xl backdrop-blur-md">
        <div className="flex items-stretch gap-1 p-2">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => {
                if (tab === entry.id) onToggle()
                else onTab(entry.id)
              }}
              aria-pressed={open && tab === entry.id}
              className={`min-h-[44px] flex-1 rounded-xl text-xs font-black transition ${
                open && tab === entry.id
                  ? "bg-amber-400 text-slate-950"
                  : "bg-white/5 text-slate-200"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
        {open && (
          <div className="max-h-[48dvh] overflow-y-auto px-3 pb-3">
            {tab === "avatar" ? avatar : tab === "house" ? house : room}
          </div>
        )}
      </div>
    </div>
  )
}
