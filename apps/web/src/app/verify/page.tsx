"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePlayer } from "@/lib/player"
import { IDENTITY_RESULT_EVENT, SESSION_REFRESH_EVENT, requestIdentityCheck, requestPrivyLogin } from "@/lib/privy"
import type { IdentityStatus } from "@/lib/identity"

type LiveStatus = IdentityStatus | "linked" | "taken"

type LiveResult = { status: LiveStatus; expiresAt: string | null }

function when(iso: string | null): string {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
}

function describe(result: LiveResult | null, failedReason: string | null): string {
  if (!result) return "Checking this wallet on Celo…"
  const date = when(result.expiresAt)
  if (result.status === "verified") return `This wallet is verified${date ? ` until ${date}` : ""}. One face, one account.`
  if (result.status === "expired") return `The face check expired${date ? ` on ${date}` : ""}. Check again to renew it.`
  if (result.status === "linked") return "This wallet is attached to a face on a different wallet, so it can't be verified here."
  if (result.status === "taken") return "This person already verified another Tiral account. Nothing on this account was changed."
  if (failedReason) return `GoodDollar didn't verify this wallet. ${failedReason}`
  return "This wallet isn't verified yet. The face check happens on GoodDollar. Tiral never sees the photo."
}

export default function VerifyPage() {
  const { player, ready } = usePlayer()
  const [result, setResult] = useState<LiveResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [failedReason, setFailedReason] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const signedIn = player?.user.signedIn === true

  useEffect(() => {
    const onResult = (event: Event) => {
      setStarting(false)
      setError((event as CustomEvent<string>).detail || "The face check didn't start. Try again.")
    }
    window.addEventListener(IDENTITY_RESULT_EVENT, onResult)
    return () => window.removeEventListener(IDENTITY_RESULT_EVENT, onResult)
  }, [])

  useEffect(() => {
    if (!ready || !signedIn) return
    const params = new URLSearchParams(window.location.search)
    const failed = params.get("isVerified") === "false"
    const reason = params.get("reason")
    if (failed && reason) setFailedReason(reason)
    let cancelled = false
    const pull = async (attempt: number) => {
      try {
        const response = await fetch("/api/identity", { method: "POST" })
        const body = (await response.json()) as LiveResult & { error?: string }
        if (cancelled) return
        if (!response.ok) {
          setError(body.error ?? "Celo didn't answer. Try again in a moment.")
          return
        }
        setResult(body)
        setError(null)
        window.dispatchEvent(new Event(SESSION_REFRESH_EVENT))
        const waiting = params.get("isVerified") === "true" && body.status === "none" && attempt < 5
        if (waiting) window.setTimeout(() => void pull(attempt + 1), 3000)
      } catch {
        if (!cancelled) setError("Celo didn't answer. Try again in a moment.")
      }
    }
    void pull(0)
    return () => {
      cancelled = true
    }
  }, [ready, signedIn])

  return (
    <main className="min-h-dvh w-full bg-sheet px-4 py-10 text-sheet-ink">
      <div className="mx-auto w-full max-w-md">
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-flame-deep">GoodDollar</div>
        <h1 className="mt-1 text-2xl font-black">One real person</h1>
        <p className="mt-2 text-sm leading-snug text-sheet-mute">
          GoodDollar checks that this wallet belongs to a live person. Tiral stores the result, not your photo. One face verifies one account.
        </p>
        {!ready ? (
          <p className="mt-4 text-sm text-sheet-mute">Checking who you are…</p>
        ) : !signedIn ? (
          <button
            type="button"
            onClick={requestPrivyLogin}
            className="mt-4 flex min-h-[48px] w-full items-center justify-center rounded-xl bg-flame px-3 text-sm font-black text-white"
          >
            Sign in first
          </button>
        ) : (
          <>
            <p className="mt-4 text-sm leading-snug text-sheet-ink">{describe(result, failedReason)}</p>
            {error && <p className="mt-2 text-sm font-bold text-flame-deep">{error}</p>}
            <button
              type="button"
              disabled={starting || result?.status === "taken" || result?.status === "linked"}
              onClick={() => {
                setError(null)
                setStarting(true)
                requestIdentityCheck()
              }}
              className="mt-4 flex min-h-[48px] w-full items-center justify-center rounded-xl bg-flame px-3 text-sm font-black text-white disabled:opacity-40"
            >
              {starting ? "Opening the face check…" : result?.status === "verified" || result?.status === "expired" ? "Check again" : "Check my face"}
            </button>
          </>
        )}
        <Link href="/play" className="mt-4 inline-flex min-h-[44px] items-center text-sm font-bold text-sheet-mute">
          Back to the game
        </Link>
      </div>
    </main>
  )
}
