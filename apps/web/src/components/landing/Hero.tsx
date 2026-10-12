"use client"

import dynamic from "next/dynamic"
import Link from "next/link"

const MiniMap = dynamic(() => import("./MiniMap").then((m) => m.MiniMap), {
  ssr: false,
  loading: () => <div className="absolute inset-0 animate-pulse bg-slate-900" />
})

export function Hero() {
  return (
    <section className="relative flex min-h-[88vh] w-full items-center justify-center overflow-hidden">
      {/* real live map as background */}
      <div className="absolute inset-0">
        <MiniMap
          center={[32.5785, 0.3096]}
          zoom={12.2}
          pitch={48}
          bearing={-18}
          glideTo={{ center: [32.5832, 0.3152], zoom: 12.8 }}
        />
      </div>
      {/* readability gradients */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/80 via-slate-950/45 to-slate-950" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(2,6,23,0.55)_100%)]" />

      {/* overlaid text */}
      <div className="pointer-events-none relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center px-4 py-20 text-center">
        <h1 className="text-4xl font-black leading-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)] sm:text-6xl">
          Hunt treasure on the real streets of <span className="text-amber-400">Kampala</span>
        </h1>
        <p className="mt-4 max-w-xl text-base text-slate-100 drop-shadow-[0_1px_8px_rgba(0,0,0,0.9)] sm:text-lg">
          Pick a start, race rivals along real roads to a hidden bounty, and climb the ranks.
          Free to play — no install, right in your browser.
        </p>
        <div className="pointer-events-auto mt-7 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Link
            href="/play"
            className="rounded-xl bg-amber-400 px-8 py-3.5 text-center text-base font-black text-slate-950 shadow-xl transition hover:bg-amber-300"
          >
            ▶ Play now — free
          </Link>
          <a
            href="/api/auth/tiktok"
            className="rounded-xl border border-white/30 bg-slate-950/70 px-8 py-3.5 text-center text-base font-bold text-white shadow-xl backdrop-blur-sm transition hover:bg-slate-950/90"
          >
            Continue with TikTok
          </a>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs font-semibold text-slate-200 drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)]">
          <span>✓ No install</span>
          <span>✓ Guest play instantly</span>
          <span>✓ Live multiplayer</span>
        </div>
        <div className="mt-6 rounded-lg bg-slate-950/70 px-3 py-1.5 text-[11px] font-bold text-slate-300 backdrop-blur-sm">
          ↓ Drag the map behind this text — it&apos;s the real game map
        </div>
      </div>
    </section>
  )
}
