"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const TABS = [
  { label: "Home", href: "/", icon: "⌂" },
  { label: "Play", href: "/play", icon: "▶" },
  { label: "Profile", href: "/profile", icon: "●" }
]

// Mobile-only bottom navigation (md+ uses header links instead).
// Fixed height ~4rem + safe area; bottom-anchored overlays lift above it.
export function MobileTabBar() {
  const pathname = usePathname()
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-slate-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <div className="grid grid-cols-3">
        {TABS.map((tab) => {
          const active =
            tab.href === "/" ? pathname === "/" : pathname?.startsWith(tab.href) ?? false
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-[4rem] flex-col items-center justify-center gap-0.5 text-[11px] font-bold ${
                active ? "text-amber-300" : "text-slate-400"
              }`}
            >
              <span aria-hidden className="text-lg leading-none">
                {tab.icon}
              </span>
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
