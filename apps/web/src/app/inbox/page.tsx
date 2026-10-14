"use client"

import Link from "next/link"
import { usePlayer } from "@/lib/player"
import { LifePanel } from "@/components/LifePanel"
import { Skeleton } from "@/components/ui"

// Rent, stress and the messages from home: urgent enough for its own tab.
export default function InboxPage() {
  const { ready, player } = usePlayer()
  return (
    <main className="h-dvh w-full overflow-y-auto bg-slate-950 text-white">
      <div className="mx-auto w-full max-w-xl px-4 pb-[calc(var(--shell-bottom)+1.5rem)] pt-[calc(var(--shell-top)+1.25rem)]">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Inbox</div>
        <h1 className="text-2xl font-black">Life in Kampala</h1>
        <div className="mt-4">
          {!ready ? (
            <Skeleton className="h-64" />
          ) : player ? (
            <LifePanel />
          ) : (
            <SignedOut />
          )}
        </div>
      </div>
    </main>
  )
}

function SignedOut() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-sm text-slate-300">Sign in with TikTok or as a guest to get your runner, your room and your rent.</p>
      <Link
        href="/play"
        className="mt-3 inline-flex min-h-[44px] items-center rounded-xl bg-amber-400 px-4 text-sm font-black text-slate-950"
      >
        Sign in
      </Link>
    </div>
  )
}
