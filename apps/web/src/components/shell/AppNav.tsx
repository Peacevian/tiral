"use client"

import { useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { usePlayer } from "@/lib/player"
import { Badge } from "@/components/ui"
import { SHELL_CHANGE_EVENT } from "@/components/ui/AdaptivePanel"
import { AccountMenu } from "@/components/shell/AccountMenu"
import { PlayerStats } from "@/components/shell/PlayerBar"
import { MusicToggle } from "@/components/shell/MusicToggle"
import { useShellVisible } from "@/components/shell/useShellVisible"

const DESTINATIONS = [
  { href: "/play", label: "Play", icon: "▶" },
  { href: "/home", label: "Home", icon: "🏠" },
  { href: "/inbox", label: "Inbox", icon: "📨" },
  { href: "/leaderboard", label: "Ranks", icon: "🏆" }
] as const

// Same four destinations on every screen: a top bar with the player bar on
// tablets and desktops; on phones the player bar stays on top and the
// destinations move to a thumb-reachable tab bar.
export function AppNav() {
  const visible = useShellVisible()
  const pathname = usePathname() ?? "/"
  const { player, offline } = usePlayer()

  useEffect(() => {
    document.body.classList.toggle("has-shell", visible)
    window.dispatchEvent(new Event(SHELL_CHANGE_EVENT))
    return () => {
      document.body.classList.remove("has-shell")
      window.dispatchEvent(new Event(SHELL_CHANGE_EVENT))
    }
  }, [visible])

  if (!visible || !player) return null
  const pending = player.life?.pending ?? 0
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 border-b border-sheet-line bg-sheet text-sheet-ink pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 w-full items-center gap-2 px-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] md:gap-4 md:px-4">
          <Link
            href="/"
            className="hidden shrink-0 font-black tracking-[0.18em] text-flame-deep md:block"
            aria-label="Tiral home page"
          >
            TIRAL
          </Link>
          <nav aria-label="Primary" className="hidden flex-1 items-center justify-center gap-1 md:flex">
            {DESTINATIONS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active(item.href) ? "page" : undefined}
                className={`relative inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 text-sm font-bold transition ${
                  active(item.href) ? "bg-sheet-soft text-flame-deep" : "text-sheet-mute hover:bg-sheet-soft hover:text-sheet-ink"
                }`}
              >
                <span aria-hidden>{item.icon}</span>
                {item.label}
                {item.href === "/inbox" && <Badge count={pending} />}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-2 md:ml-0">
            {offline && (
              <span role="status" className="rounded-full bg-flame-soft px-2 py-0.5 text-[11px] font-bold text-flame-deep" title="Can't reach the server">
                ⚠ Offline
              </span>
            )}
            <MusicToggle />
            <PlayerStats />
            <AccountMenu showName />
          </div>
        </div>
      </header>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-sheet-line bg-sheet pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <div className="grid h-16 grid-cols-4">
          {DESTINATIONS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active(item.href) ? "page" : undefined}
              className={`relative flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold ${
                active(item.href) ? "text-flame-deep" : "text-sheet-mute"
              }`}
            >
              <span aria-hidden className="text-lg leading-none">
                {item.icon}
              </span>
              {item.label}
              {item.href === "/inbox" && <Badge count={pending} className="absolute right-[calc(50%-1.5rem)] top-2" />}
            </Link>
          ))}
        </div>
      </nav>
    </>
  )
}
