import Link from "next/link"
import { Hero } from "@/components/landing/Hero"
import { HowItWorks } from "@/components/landing/HowItWorks"
import { LiveStrip } from "@/components/landing/LiveStrip"
import { AdvertiseCta } from "@/components/landing/AdvertiseCta"
import { Footer } from "@/components/landing/Footer"

// Static marketing page: prerendered shell, no sockets. The hero phone
// lazily mounts a real live MapLibre map on the client; the LiveStrip
// snapshot is best-effort and never blocks rendering.
export const dynamic = "force-static"

export default function LandingPage() {
  return (
    <main className="min-h-screen w-full overflow-y-auto bg-slate-950">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
        <span className="text-lg font-black text-white">Tiral</span>
        <div className="flex items-center gap-2">
          <Link
            href="/leaderboard"
            className="rounded-lg px-3 py-2 text-sm font-bold text-slate-300 transition hover:text-white"
          >
            Ranks
          </Link>
          <Link
            href="/play"
            className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-amber-300"
          >
            Play
          </Link>
        </div>
      </header>
      <Hero />
      <LiveStrip />
      <HowItWorks />
      <AdvertiseCta />
      <Footer />
    </main>
  )
}
