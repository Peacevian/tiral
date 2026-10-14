"use client"

import type { ReactNode } from "react"

export type HomeSheetTab = "avatar" | "house" | "room" | "body" | "wallet"

const TABS: { id: HomeSheetTab; label: string }[] = [
  { id: "avatar", label: "🧍 Avatar" },
  { id: "house", label: "🏠 House" },
  { id: "room", label: "📋 Me" },
  { id: "body", label: "⚡ Body" },
  { id: "wallet", label: "🪙 Wallet" }
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
  room,
  body,
  wallet,
  badges
}: {
  tab: HomeSheetTab
  onTab(tab: HomeSheetTab): void
  open: boolean
  onToggle(): void
  avatar: ReactNode
  house: ReactNode
  room: ReactNode
  body: ReactNode
  wallet: ReactNode
  /** Small count shown on a tab (e.g. unanswered messages). */
  badges?: Partial<Record<HomeSheetTab, number>>
}) {
  return (
    <div className="absolute inset-x-0 bottom-[var(--shell-bottom)] z-20 px-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pb-2 md:bottom-0 md:left-auto md:right-0 md:top-[var(--shell-top)] md:w-[23rem] md:px-2 md:py-2">
      <div className="mx-auto w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-slate-950/90 shadow-2xl backdrop-blur-md md:mx-0 md:flex md:h-full md:max-w-none md:flex-col md:rounded-2xl">
        <button
          type="button"
          onClick={onToggle}
          aria-label={open ? "Collapse panel" : "Expand panel"}
          aria-expanded={open}
          className="flex min-h-[22px] w-full items-center justify-center md:hidden"
        >
          <span aria-hidden className="h-1 w-9 rounded-full bg-white/25" />
        </button>
        <div className="flex items-stretch gap-1 px-2 pb-2 md:pt-2">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => {
                if (tab === entry.id) onToggle()
                else onTab(entry.id)
              }}
              aria-pressed={open && tab === entry.id}
              className={`relative min-h-[44px] flex-1 rounded-xl text-[11px] font-black transition sm:text-xs ${
                open && tab === entry.id
                  ? "bg-amber-400 text-slate-950"
                  : "bg-white/5 text-slate-200"
              }`}
            >
              {entry.label}
              {(badges?.[entry.id] ?? 0) > 0 && (
                <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white">
                  {badges?.[entry.id]}
                </span>
              )}
            </button>
          ))}
        </div>
        <div
          className={`max-h-[34dvh] overflow-y-auto overscroll-contain px-3 pb-3 sm:max-h-[40dvh] landscape:max-h-[55dvh] md:max-h-none md:min-h-0 md:flex-1 md:pb-4 ${
            open ? "" : "hidden md:block"
          }`}
        >
          {tab === "avatar"
            ? avatar
            : tab === "house"
              ? house
              : tab === "body"
                ? body
                : tab === "wallet"
                  ? wallet
                  : room}
        </div>
      </div>
    </div>
  )
}
