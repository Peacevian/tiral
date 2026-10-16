import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getSharedPrizeRace } from "@tiral/db"

export const dynamic = "force-dynamic"

// A prize race winner's brag link (tiral.geinz.lol/w/CODE/PLACE).

async function load(code: string, place: string) {
  const position = Number(place)
  if (!/^[A-Za-z0-9]{5}$/.test(code) || !Number.isInteger(position)) return null
  const race = await getSharedPrizeRace(code).catch(() => null)
  const won = race?.winners.find((entry) => entry.place === position)
  return race && won ? { race, won } : null
}

export async function generateMetadata({ params }: { params: Promise<{ code: string; place: string }> }): Promise<Metadata> {
  const { code, place } = await params
  const found = await load(code, place)
  if (!found) return { title: "Tiral" }
  const title = `${found.won.name} won ${found.won.amount.toLocaleString("en-US")} BNG on Tiral`
  const description = `In ${found.race.host.name}'s prize race. Think you can beat them? Play free.`
  const image = { url: `/api/share/win/${found.race.roomCode}/${found.won.place}?size=preview`, width: 1200, height: 630, alt: title }
  return {
    title,
    description,
    openGraph: { title, description, images: [image], type: "website" },
    twitter: { card: "summary_large_image", title, description, images: [image.url] }
  }
}

export default async function WinPage({ params }: { params: Promise<{ code: string; place: string }> }) {
  const { code, place } = await params
  const found = await load(code, place)
  if (!found) notFound()
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-slate-950 px-5 py-10 text-center text-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/share/win/${found.race.roomCode}/${found.won.place}`} alt="" width={1080} height={1920} className="w-full max-w-[340px] rounded-2xl border border-amber-300/30 shadow-2xl" />
      <h1 className="text-2xl font-black text-amber-300">
        {found.won.name} won {found.won.amount.toLocaleString("en-US")} BNG
      </h1>
      <Link href="/play" className="min-h-[52px] rounded-2xl bg-amber-400 px-8 py-3.5 text-base font-black text-slate-950">
        Race on Tiral →
      </Link>
      <p className="text-xs text-slate-400">Free to play in your browser. No install.</p>
    </main>
  )
}
