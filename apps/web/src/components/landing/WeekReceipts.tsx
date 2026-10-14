"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import styles from "./banange.module.css"

type Line = { label: string; amount: number }
type Day = { day: string; lines: Line[]; stamp?: { text: string; color: string }; live?: boolean }

// A week of the hustle, as till receipts. Amounts in UGX-scale BNG.
const WEEK: Day[] = [
  {
    day: "MON",
    lines: [
      { label: "Pocket money", amount: 10_000 },
      { label: "Rolex", amount: -2_000 },
      { label: "Taxi to Owino", amount: -1_500 }
    ]
  },
  {
    day: "TUE",
    lines: [
      { label: "Porter, Owino", amount: 7_000 },
      { label: "Data bundle", amount: -1_000 },
      { label: "Chapati x2", amount: -1_000 }
    ]
  },
  {
    day: "WED",
    lines: [
      { label: "Maama (hospital)", amount: -5_000 },
      { label: "FastCash loan", amount: 20_000 }
    ],
    stamp: { text: "DEBT", color: "#c8102e" }
  },
  {
    day: "THU",
    lines: [
      { label: "Loan deducted", amount: -24_000 },
      { label: "Rolex", amount: -2_000 }
    ]
  },
  {
    day: "FRI",
    lines: [{ label: "Rent due", amount: -150_000 }],
    stamp: { text: "OVERDUE", color: "#c8102e" }
  },
  {
    day: "SAT",
    lines: [
      { label: "Race finish", amount: 1_000 },
      { label: "1st place", amount: 5_000 },
      { label: "First win today", amount: 2_000 }
    ],
    stamp: { text: "PAID", color: "#1f6f43" },
    live: true
  }
]

const fmt = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("en-US")}`

function Receipt({ day, index, printed }: { day: Day; index: number; printed: boolean }) {
  const total = day.lines.reduce((sum, line) => sum + line.amount, 0)
  return (
    <li
      className={`relative w-[13.5rem] shrink-0 snap-start ${index % 2 ? "rotate-[1.5deg]" : "-rotate-[1.2deg]"}`}
      style={{ animationDelay: `${index * 140}ms` }}
    >
      <div
        className={`${styles.receipt} ${printed ? styles.printIn : "opacity-0"} px-4 pt-4 font-[family-name:var(--font-receipt)] text-[13px] text-[#232323] shadow-[3px_4px_0_rgba(0,0,0,0.25)]`}
        style={{ animationDelay: `${index * 140}ms` }}
      >
        <div className="text-center text-xs font-bold tracking-[0.2em]">KAMPALA HUSTLE</div>
        <div className="mt-0.5 text-center text-[11px]">{day.day} · till 004</div>
        <div className="my-2 border-t border-dashed border-[#9a9a9a]" />
        <ul className="flex flex-col gap-1">
          {day.lines.map((line) => (
            <li key={line.label} className="flex justify-between gap-2">
              <span className="truncate">{line.label}</span>
              <span className={line.amount < 0 ? "" : "font-bold"}>{fmt(line.amount)}</span>
            </li>
          ))}
        </ul>
        <div className="my-2 border-t border-dashed border-[#9a9a9a]" />
        <div className="flex justify-between font-bold">
          <span>DAY</span>
          <span>{fmt(total)}</span>
        </div>
        {day.live && <div className="mt-2 text-center text-[11px] font-bold">✓ playable today</div>}
        {day.stamp ? (
          <div className="mt-3 flex justify-center">
            <div
              className={`${styles.stamp} px-2 py-0.5 font-[family-name:var(--font-sign)] text-xl`}
              style={{ color: day.stamp.color }}
            >
              {day.stamp.text}
            </div>
          </div>
        ) : (
          <div className="mt-3 h-8" />
        )}
      </div>
    </li>
  )
}

export function WeekReceipts() {
  const ref = useRef<HTMLElement>(null)
  const [printed, setPrinted] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setPrinted(true)
          observer.disconnect()
        }
      },
      { threshold: 0.25 }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <section ref={ref} className="relative w-full overflow-hidden bg-[#ebe4d3] py-14 text-[#1b1b1b]">
      <div aria-hidden className={`${styles.noise} absolute inset-0 mix-blend-multiply`} />
      <div className="relative mx-auto max-w-6xl px-4">
        <h2 className="font-[family-name:var(--font-sign)] text-4xl uppercase leading-none sm:text-6xl">
          One week in Kampala
        </h2>
        <p className="mt-3 max-w-lg text-base text-[#3b3324]">
          Little money, a lot of responsibilities. The week squeezes you, and the race is how you fight back.
        </p>

        <div className="mt-6 flex items-center gap-2 font-[family-name:var(--font-marker)] text-lg text-[#1f4e8c]">
          Swipe the week <span aria-hidden>→</span>
        </div>
        <ol className="-mx-4 mt-3 flex snap-x items-start gap-5 overflow-x-auto px-4 pb-6 pt-2 [scrollbar-width:none]">
          {WEEK.map((day, index) => (
            <Receipt key={day.day} day={day} index={index} printed={printed} />
          ))}
          <li className="flex w-[13.5rem] shrink-0 snap-start flex-col justify-center rotate-[1deg] border-[3px] border-dashed border-[#1b1b1b] bg-[#dfae3a] p-5">
            <div className="font-[family-name:var(--font-sign)] text-3xl uppercase leading-none">SUN</div>
            <div className="mt-2 font-[family-name:var(--font-marker)] text-2xl leading-tight text-[#c8102e]">
              Your move.
            </div>
            <Link
              href="/play"
              className={`${styles.signButton} mt-4 self-start border-[3px] border-[#1b1b1b] bg-[#1b1b1b] px-4 py-2 font-[family-name:var(--font-sign)] text-lg uppercase text-[#dfae3a]`}
            >
              Race now →
            </Link>
          </li>
        </ol>

        <p className="text-xs font-semibold text-[#5a4f3a]">
          Live today: races and Banange Coins. Coming next: rent, side hustles, loans and the come-up.
        </p>
      </div>
    </section>
  )
}
