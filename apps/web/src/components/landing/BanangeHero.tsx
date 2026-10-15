"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import type { AvatarAct } from "@/components/RealisticAvatar"
import type { Bill } from "./BillsMap"
import styles from "./banange.module.css"

const BillsMap = dynamic(() => import("./BillsMap").then((m) => m.BillsMap), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[#ece8de]" />
})
const StreetRunner = dynamic(() => import("./StreetRunner").then((m) => m.StreetRunner), {
  ssr: false,
  loading: () => null
})

// Real places, generic labels.
const BILLS: Bill[] = [
  { id: "hospital", icon: "🏥", place: "Hospital", label: "Maama's bill", amount: "150,000", lngLat: [32.5626, 0.3266] },
  { id: "rent", icon: "🏠", place: "Home, Kisenyi", label: "Rent due Friday", amount: "150,000", lngLat: [32.5647, 0.3107] },
  { id: "school", icon: "🎒", place: "School", label: "Sister's fees", amount: "200,000", lngLat: [32.5995, 0.3206] }
]

type Bubble = "none" | "pockets" | "banange"

// One loop: [start ms, runner act, bills showing, bubble]
const BEATS: Array<[number, AvatarAct, number, Bubble]> = [
  [0, "calm", 0, "none"],
  [900, "calm", 1, "none"],
  [2100, "calm", 2, "none"],
  [3300, "flinch", 3, "none"],
  [4700, "shock", 3, "pockets"],
  [6700, "collapse", 3, "banange"]
]
const LOOP_MS = 10500

function useStory(active: boolean) {
  const [beat, setBeat] = useState(0)
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches)
  }, [])

  useEffect(() => {
    if (!active || reduced) return
    let timers: ReturnType<typeof setTimeout>[] = []
    const play = () => {
      timers = BEATS.map(([at], index) => setTimeout(() => setBeat(index), at))
      timers.push(setTimeout(play, LOOP_MS))
    }
    play()
    return () => timers.forEach(clearTimeout)
  }, [active, reduced])

  if (reduced) return { act: "calm" as AvatarAct, bills: BILLS.length, bubble: "none" as Bubble }
  const [, act, bills, bubble] = BEATS[beat]!
  return { act, bills, bubble }
}

function SpeechBubble({ bubble }: { bubble: Bubble }) {
  if (bubble === "pockets") {
    return (
      <div className="relative border-[3px] border-[#1b1b1b] bg-[#fbfaf5] px-3 py-1.5 text-center shadow-[4px_4px_0_#1b1b1b]">
        <div className="text-[11px] font-black uppercase tracking-[0.12em] text-[#4a4335]">Pockets</div>
        <div className="font-[family-name:var(--font-sign)] text-2xl leading-none">UGX 0</div>
      </div>
    )
  }
  if (bubble === "banange") {
    return (
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
          <span className="relative block whitespace-nowrap font-[family-name:var(--font-marker)] text-4xl text-[#c8102e] sm:text-6xl">
            BANANGE!
          </span>
        </div>
      </div>
    )
  }
  return null
}

/** Slow or metered connection (Data Saver, 2G/3G): don't download the live hero. */
function slowConnection(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  return Boolean(connection?.saveData) || ["slow-2g", "2g", "3g"].includes(connection?.effectiveType ?? "")
}

export function BanangeHero() {
  const sectionRef = useRef<HTMLElement>(null)
  const [inView, setInView] = useState(true)
  // Phones get a still poster (28 KB) instead of the live map + 3D runner
  // (~1 MB of map engine, three.js and the avatar model): most players are on
  // 3G/4G and pay for data. The live hero loads on wide screens with a decent
  // connection, or when someone taps "Watch the story".
  const [live, setLive] = useState(false)
  useEffect(() => {
    if (window.innerWidth >= 768 && !slowConnection()) setLive(true)
  }, [])

  // Only run the story (and its timers) while the hero is on screen.
  useEffect(() => {
    const node = sectionRef.current
    if (!node) return
    const observer = new IntersectionObserver(([entry]) => setInView(Boolean(entry?.isIntersecting)), {
      threshold: 0.15
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const { act, bills, bubble } = useStory(inView && live)
  // Frame the map so the bills land around the centred content, not under it.
  const [narrow] = useState(() => typeof window !== "undefined" && window.innerWidth < 768)

  return (
    <section
      ref={sectionRef}
      className="relative h-[calc(100svh-3.5rem)] max-h-[900px] min-h-[620px] w-full overflow-hidden bg-slate-950 text-[#f6efe0]"
    >
      <p className="sr-only">
        On a map of Kampala, bills pop up one after another: a hospital bill of 150,000, rent of 150,000 at home in
        Kisenyi and school fees of 200,000. The runner checks their pockets, finds nothing, shouts “Banange!” and
        falls down.
      </p>

      {/* Phones: a still of the scene below, in the first HTML response. It stays
          underneath if the live hero is loaded on top. */}
      {/* Only phone-width screens fetch it (a hidden <img> would still download). */}
      <picture>
        <source media="(max-width: 767px)" srcSet="/landing/hero-phone-v1.webp" type="image/webp" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="
          alt=""
          fetchPriority="high"
          className="absolute inset-0 h-full w-full object-cover object-bottom md:hidden"
        />
      </picture>

      {/* the real game map, dimmed */}
      {live && (
        <BillsMap
          bills={BILLS}
          shown={bills}
          center={narrow ? [32.5778, 0.3395] : [32.581, 0.318]}
          zoom={narrow ? 12.05 : 14}
          shade="radial-gradient(ellipse 48% 55% at 50% 42%, rgba(2,6,23,0.92) 0%, rgba(2,6,23,0.72) 60%, rgba(2,6,23,0.55) 100%)"
        />
      )}

      {/* content, centred in front of the map */}
      <div data-hero-copy className="pointer-events-none relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center px-4 pt-8 text-center md:pt-[6vh]">
        <span className="rotate-[-2deg] bg-[#dfae3a] px-2 py-0.5 font-[family-name:var(--font-sign)] text-sm tracking-[0.2em] text-[#1b1b1b]">
          KAMPALA · DAY ONE
        </span>
        <h1 className="mt-4 font-[family-name:var(--font-sign)] text-[2.7rem] uppercase leading-[0.95] sm:text-6xl lg:text-7xl">
          10k in your pocket.
          <br />
          <span className="text-[#ff4b4b]">Bills everywhere.</span>
        </h1>
        <p className="mt-4 max-w-md text-base font-medium leading-relaxed text-[#e8e0cd] sm:text-lg">
          Race the real streets of Kampala for the treasure that saves your week. Every finish pays Banange Coins.
        </p>
        <div className="pointer-events-auto mt-6 flex flex-col items-center gap-3 sm:flex-row sm:gap-6">
          <Link
            href="/play"
            className={`${styles.signButton} border-[3px] border-[#1b1b1b] bg-[#c8102e] px-7 py-3 font-[family-name:var(--font-sign)] text-2xl uppercase tracking-wide text-[#fbf6e6]`}
          >
            Run for it →
          </Link>
          <a
            href="/api/auth/tiktok"
            className="text-sm font-bold underline decoration-2 underline-offset-4 hover:text-[#dfae3a]"
          >
            or continue with TikTok
          </a>
        </div>
      </div>

      {/* the runner, centre stage under the button */}
      {live && (
        <div className="pointer-events-none absolute bottom-16 left-1/2 z-10 h-[30%] w-[16rem] -translate-x-1/2 sm:w-[20rem] md:bottom-0 md:h-[40%]">
          <StreetRunner act={act} />
          <div className="absolute left-[64%] top-0 -translate-x-1/2 -translate-y-1/3 text-[#1b1b1b]">
            <SpeechBubble bubble={bubble} />
          </div>
        </div>
      )}

      {!live && (
        <button
          type="button"
          onClick={() => setLive(true)}
          className="absolute bottom-4 right-4 z-20 rounded-full border border-white/20 bg-slate-950/70 px-3 py-2 text-xs font-bold text-[#f6efe0] backdrop-blur-sm"
        >
          ▶ Watch the story <span className="font-normal text-[#cfc6b0]">(~1 MB)</span>
        </button>
      )}
    </section>
  )
}
