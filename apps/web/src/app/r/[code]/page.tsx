import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { PRIZE_CUT_SHARE } from "@tiral/game-core"
import { getSharedPrizeRace } from "@tiral/db"

export const dynamic = "force-dynamic"

// A prize race's shareable link (playtiral.com/r/CODE): chats show its
// poster as the link preview; tapping through joins the race.

async function load(code: string) {
  if (!/^[A-Za-z0-9]{5}$/.test(code)) return null
  return getSharedPrizeRace(code).catch(() => null)
}

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params
  const race = await load(code)
  if (!race) return { title: "Tiral prize race" }
  const title = `${race.pot.toLocaleString("en-US")} BNG prize race by ${race.host.name}`
  const description = `${race.shares.length} winner${race.shares.length === 1 ? "" : "s"} · race code ${race.roomCode} · free to play on Tiral`
  const image = { url: `/api/share/race/${race.roomCode}?size=preview`, width: 1200, height: 630, alt: title }
  return {
    title,
    description,
    openGraph: { title, description, images: [image], type: "website" },
    twitter: { card: "summary_large_image", title, description, images: [image.url] }
  }
}

export default async function PrizeRacePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const race = await load(code)
  if (!race) notFound()
  const payable = Math.floor(race.pot * (1 - PRIZE_CUT_SHARE))
  const open = race.status === "scheduled"
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-slate-950 px-5 py-10 text-center text-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/share/race/${race.roomCode}`} alt="" width={1080} height={1920} className="w-full max-w-[340px] rounded-2xl border border-amber-300/30 shadow-2xl" />
      <div>
        <h1 className="text-2xl font-black text-amber-300">{race.pot.toLocaleString("en-US")} BNG prize race</h1>
        <p className="mt-1 text-sm text-slate-300">
          Hosted by <span className="font-bold text-white">{race.host.name}</span> ·{" "}
          {race.shares.map((share, index) => `${index + 1}. ${Math.floor((payable * share) / 100).toLocaleString("en-US")}`).join(" · ")}
        </p>
      </div>
      {open ? (
        <Link href={`/play?join=${race.roomCode}`} className="min-h-[52px] rounded-2xl bg-amber-400 px-8 py-3.5 text-base font-black text-slate-950">
          Join the race →
        </Link>
      ) : (
        <Link href="/play" className="min-h-[52px] rounded-2xl bg-amber-400 px-8 py-3.5 text-base font-black text-slate-950">
          {race.status === "live" ? "It's racing now: play Tiral →" : "This race is over: play Tiral →"}
        </Link>
      )}
      <p className="text-xs text-slate-400">Free to play in your browser. No install.</p>
    </main>
  )
}
