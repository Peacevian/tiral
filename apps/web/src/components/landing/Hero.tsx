import Link from "next/link"
import { PhoneMock } from "./PhoneMock"

export function Hero() {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col items-center gap-10 px-4 pb-16 pt-12 sm:pt-20 lg:flex-row lg:items-center lg:gap-14">
      <div className="w-full max-w-xl text-center lg:text-left">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-200">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          Live in Kampala · multiplayer
        </div>
        <h1 className="mt-4 text-4xl font-black leading-tight text-white sm:text-5xl">
          Hunt treasure on the real streets of <span className="text-amber-400">Kampala</span>
        </h1>
        <p className="mt-4 text-base text-slate-300 sm:text-lg">
          Pick a start, race rivals along real roads to a hidden bounty, and climb the ranks.
          Free to play — no install, right in your browser.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
          <Link
            href="/play"
            className="rounded-xl bg-amber-400 px-6 py-3.5 text-center text-base font-black text-slate-950 transition hover:bg-amber-300"
          >
            ▶ Play now — free
          </Link>
          <a
            href="/api/auth/tiktok"
            className="rounded-xl border border-white/20 bg-white/5 px-6 py-3.5 text-center text-base font-bold text-white transition hover:bg-white/10"
          >
            Continue with TikTok
          </a>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-slate-400 lg:justify-start">
          <span>✓ No install</span>
          <span>✓ Guest play instantly</span>
          <span>✓ Live multiplayer</span>
        </div>
      </div>
      <div className="flex w-full justify-center lg:w-auto">
        <PhoneMock />
      </div>
    </section>
  )
}
