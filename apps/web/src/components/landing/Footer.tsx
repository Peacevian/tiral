import Link from "next/link"

const LINKS: { label: string; href: string }[] = [
  { label: "Play", href: "/play" },
  { label: "Leaderboard", href: "/leaderboard" },
  { label: "Profile", href: "/profile" },
  { label: "Advertise", href: "/advertise" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" }
]

export function Footer() {
  return (
    <footer className="border-t border-white/10">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-4 px-4 py-8 text-center">
        <div className="text-sm font-black text-white">
          Tiral <span className="font-normal text-slate-400">— Kampala Treasure Race</span>
        </div>
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-slate-300 transition hover:text-amber-300"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <p className="text-xs text-slate-500">
          © {new Date().getFullYear()} Tiral. Play on real streets — stay safe out there.
        </p>
      </div>
    </footer>
  )
}
