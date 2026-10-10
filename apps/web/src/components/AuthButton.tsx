"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"

type AuthUser = {
  id: string
  displayName: string
  avatarUrl: string | null
}

export function AuthButton() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch("/api/auth/me")
      .then((response) => response.json())
      .then((body: { user: AuthUser | null }) => {
        if (!cancelled) setUser(body.user)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const playAsGuest = useCallback(async () => {
    setBusy(true)
    try {
      const response = await fetch("/api/auth/guest", { method: "POST" })
      const body = (await response.json()) as { user?: AuthUser }
      if (body.user) setUser(body.user)
    } catch {
      // stay signed out on failure
    } finally {
      setBusy(false)
    }
  }, [])

  const logout = useCallback(async () => {
    setBusy(true)
    try {
      await fetch("/api/auth/logout", { method: "POST" })
    } catch {
      // cookie may already be gone; still clear local state
    } finally {
      setUser(null)
      setBusy(false)
    }
  }, [])

  if (loading) {
    return <div className="text-xs text-slate-400">Checking session…</div>
  }

  if (!user) {
    return (
      <div className="flex flex-col gap-2">
        <a
          href="/api/auth/tiktok"
          className="block w-full rounded-lg bg-white px-3 py-2 text-center text-sm font-black text-slate-950 transition hover:bg-slate-200"
        >
          Continue with TikTok
        </a>
        <button
          type="button"
          onClick={playAsGuest}
          disabled={busy}
          className="w-full rounded-lg bg-white/10 px-3 py-2 text-sm font-bold text-white transition hover:bg-white/20 disabled:opacity-40"
        >
          {busy ? "…" : "Play as guest"}
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-400 text-sm font-black text-slate-950">
          {user.displayName.charAt(0).toUpperCase()}
        </div>
        <div className="truncate text-sm font-bold text-slate-100">{user.displayName}</div>
      </div>
      <span className="flex shrink-0 gap-1">
        <Link
          href="/profile"
          className="rounded-md border border-white/20 px-3 py-2 text-xs font-bold text-slate-300 min-h-[40px] inline-flex items-center"
        >
          Profile
        </Link>
        <button
          type="button"
          onClick={logout}
          disabled={busy}
          className="rounded-md border border-white/20 px-3 py-2 text-xs font-bold text-slate-300 min-h-[40px] inline-flex items-center disabled:opacity-40"
        >
          Logout
        </button>
      </span>
    </div>
  )
}
