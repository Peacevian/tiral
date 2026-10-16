"use client"

import type { ReactNode } from "react"

export type HomeSheetTab = "avatar" | "house" | "room" | "body" | "bike" | "wallet"

export const HOME_SECTIONS: { id: HomeSheetTab; icon: string; label: string; hint: string }[] = [
  { id: "avatar", icon: "🧍", label: "Avatar", hint: "Your look" },
  { id: "house", icon: "🏠", label: "House", hint: "Walls, roof, furniture" },
  { id: "body", icon: "⚡", label: "Body", hint: "Eat or sleep" },
  { id: "bike", icon: "🛵", label: "Bike", hint: "Garage" },
  { id: "wallet", icon: "🪙", label: "Wallet", hint: "Your coins" },
  { id: "room", icon: "📋", label: "Me", hint: "Stats and races" }
]

// Home's panel: a menu of tiles (with a live status line each); tapping one
// opens that section in place, with a back button to the menu. A side panel
// on tablets and desktops, a bottom sheet on phones.
export function HomeSheet({
  section,
  onSection,
  status,
  badges,
  avatar,
  house,
  room,
  body,
  bike,
  wallet
}: {
  /** The open section, or null for the menu. */
  section: HomeSheetTab | null
  onSection(section: HomeSheetTab | null): void
  /** Live one-liner shown in a section's header (e.g. "⚡82 ❤100"). */
  status?: Partial<Record<HomeSheetTab, string>>
  /** Small count shown on a tile. */
  badges?: Partial<Record<HomeSheetTab, number>>
  avatar: ReactNode
  house: ReactNode
  room: ReactNode
  body: ReactNode
  bike: ReactNode
  wallet: ReactNode
}) {
  const content: Record<HomeSheetTab, ReactNode> = { avatar, house, room, body, bike, wallet }
  const open = section ? HOME_SECTIONS.find((entry) => entry.id === section)! : null

  return (
    <div className="absolute inset-x-0 bottom-[var(--shell-bottom)] z-20 px-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pb-2 md:bottom-0 md:left-auto md:right-0 md:top-[var(--shell-top)] md:w-[23rem] md:px-2 md:py-2">
      <div className="mx-auto flex w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-sheet-line bg-sheet-card/95 shadow-2xl md:backdrop-blur-md md:mx-0 md:h-full md:max-w-none md:rounded-2xl">
        {open ? (
          <>
            <div className="flex shrink-0 items-center gap-2 border-b border-sheet-line py-1.5 pl-1.5 pr-3">
              <button
                type="button"
                onClick={() => onSection(null)}
                aria-label="Back to home menu"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-lg font-black text-sheet-ink transition hover:bg-sheet-soft"
              >
                ←
              </button>
              <span aria-hidden className="text-lg">
                {open.icon}
              </span>
              <span className="text-sm font-black text-sheet-ink">{open.label}</span>
              {status?.[open.id] && <span className="ml-auto truncate text-[11px] text-sheet-mute">{status[open.id]}</span>}
            </div>
            <div className="max-h-[40dvh] overflow-y-auto overscroll-contain px-3 pb-3 pt-3 sm:max-h-[44dvh] landscape:max-h-[55dvh] md:max-h-none md:landscape:max-h-none md:min-h-0 md:flex-1 md:pb-4">
              {content[open.id]}
            </div>
          </>
        ) : (
          <div className="p-3">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sheet-mute">Your home</span>
            </div>
            <ul className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {HOME_SECTIONS.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => onSection(entry.id)}
                    className="relative flex min-h-[72px] w-full flex-col items-center justify-center gap-1.5 rounded-2xl border border-sheet-line bg-sheet-card p-2.5 text-center transition hover:border-flame/50 hover:bg-sheet-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-flame"
                  >
                    <span aria-hidden className="text-xl leading-none">
                      {entry.icon}
                    </span>
                    <span className="block text-sm font-black text-sheet-ink">{entry.label}</span>
                    {(badges?.[entry.id] ?? 0) > 0 && (
                      <span className="absolute right-2 top-2 grid h-4 min-w-4 place-items-center rounded-full bg-flame-deep px-1 text-[11px] font-black text-white">
                        {badges?.[entry.id]}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
