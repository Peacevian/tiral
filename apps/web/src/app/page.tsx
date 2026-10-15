import Link from "next/link"
import { Anton, Courier_Prime, Permanent_Marker } from "next/font/google"
import { BanangeHero } from "@/components/landing/BanangeHero"
import { WeekReceipts } from "@/components/landing/WeekReceipts"
import { LiveStrip } from "@/components/landing/LiveStrip"
import { AdvertiseCta } from "@/components/landing/AdvertiseCta"
import { Footer } from "@/components/landing/Footer"

// Street lettering: hand-painted shop signs, a marker scrawl, till receipts.
const sign = Anton({ weight: "400", subsets: ["latin"], variable: "--font-sign" })
const marker = Permanent_Marker({ weight: "400", subsets: ["latin"], variable: "--font-marker" })
const receipt = Courier_Prime({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-receipt" })

// Static marketing page: prerendered shell, no sockets. The hero's runner
// loads lazily on the client; the LiveStrip snapshot never blocks rendering.
export const dynamic = "force-static"

export default function LandingPage() {
  return (
    <main
      className={`${sign.variable} ${marker.variable} ${receipt.variable} h-dvh w-full overflow-y-auto bg-slate-950`}
    >
      <header className="relative z-20 w-full bg-[#1b1b1b]">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
          <span className="font-[family-name:var(--font-sign)] text-2xl tracking-[0.12em] text-[#dfae3a]">TIRAL</span>
          <div className="flex items-center gap-4">
            <Link href="/leaderboard" className="text-sm font-bold text-[#f1ead7] underline-offset-4 hover:underline">
              Ranks
            </Link>
            <Link
              href="/play"
              className="border-2 border-[#dfae3a] px-4 py-1.5 font-[family-name:var(--font-sign)] text-base uppercase tracking-wide text-[#dfae3a] transition hover:bg-[#dfae3a] hover:text-[#1b1b1b]"
            >
              Play
            </Link>
          </div>
        </div>
      </header>
      <BanangeHero />
      <WeekReceipts />
      <LiveStrip />
      <AdvertiseCta />
      <Footer />
    </main>
  )
}
