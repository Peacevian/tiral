"use client"

import { useEffect, useState } from "react"
import { Permanent_Marker } from "next/font/google"
import styles from "@/components/landing/banange.module.css"

const marker = Permanent_Marker({ weight: "400", subsets: ["latin"] })

/** Fetch the marker font ahead of time; a collapse lasts seconds, too short to load it then. */
export function PreloadCollapseFont() {
  return (
    <span aria-hidden className={`${marker.className} pointer-events-none absolute h-px w-px overflow-hidden opacity-0`}>
      BANANGE!
    </span>
  )
}

// You sprinted on empty until your body gave out. Down for a few seconds,
// never out of the race.
export function CollapseOverlay({ until }: { until: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(id)
  }, [])
  const seconds = Math.max(0, Math.ceil((until - now) / 1000))

  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center bg-flame-soft/60">
      <div className={styles.burst}>
        <div className="relative">
          <svg viewBox="0 0 400 200" className="absolute -inset-x-8 -inset-y-6 h-[calc(100%+3rem)] w-[calc(100%+4rem)]">
            <polygon
              points="200,4 228,52 290,18 282,72 368,58 318,100 396,128 312,134 340,190 262,152 232,196 200,150 168,196 138,152 60,190 88,134 4,128 82,100 32,58 118,72 110,18 172,52"
              fill="#fbe14b"
              stroke="#1b1b1b"
              strokeWidth="5"
              strokeLinejoin="round"
            />
          </svg>
          <span className={`${marker.className} relative block whitespace-nowrap text-5xl text-[#c8102e] sm:text-7xl`}>
            BANANGE!
          </span>
        </div>
      </div>
      <div className="mt-12 rounded-xl bg-sheet-card/95 px-4 py-2 text-center text-sm font-bold text-sheet-ink shadow-xl">
        You collapsed. Back up in {seconds}s.
        <div className="text-xs font-semibold text-sheet-mute">Sprinting on an empty tank burns your health.</div>
      </div>
    </div>
  )
}
