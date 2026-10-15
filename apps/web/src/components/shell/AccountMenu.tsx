"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePlayer } from "@/lib/player"
import { PlayerAvatar } from "@/components/shell/PlayerBar"

// The avatar button: who you are, keeping a guest account, logging out.
export function AccountMenu({ showName = false }: { showName?: boolean }) {
  const { player, busy, logout } = usePlayer()
  const [open, setOpen] = useState(false)
  // Guests can't sign back in, so logging out loses everything: ask first.
  const [confirmGuestLogout, setConfirmGuestLogout] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) setConfirmGuestLogout(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", onPointer)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onPointer)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  if (!player) return null
  const { user } = player
  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Account"
        aria-expanded={open}
        className="flex min-h-[44px] items-center gap-2 rounded-full p-1 transition hover:bg-white/5 md:pl-3"
      >
        {showName && <span className="hidden max-w-[9rem] truncate text-sm font-bold text-white md:inline">{user.displayName}</span>}
        <PlayerAvatar name={user.displayName} url={user.avatarUrl} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 flex w-64 max-w-[calc(100vw-1rem)] flex-col gap-1 rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-2xl md:backdrop-blur-md">
          <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
            <PlayerAvatar name={user.displayName} url={user.avatarUrl} size={32} />
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-white">{user.displayName}</div>
              <div className="text-[11px] text-slate-400">{user.tiktokLinked ? "TikTok connected" : "Guest account"}</div>
            </div>
          </div>
          {!user.tiktokLinked && (
            <a
              href="/api/auth/tiktok"
              className="rounded-xl bg-white px-3 py-2.5 text-center text-sm font-black text-slate-950"
            >
              Connect TikTok
              <span className="block text-[11px] font-semibold text-slate-600">Keep your progress for good</span>
            </a>
          )}
          <Link
            href="/home?tab=avatar"
            onClick={() => setOpen(false)}
            className="flex min-h-[44px] items-center rounded-xl px-3 text-sm font-bold text-slate-100 hover:bg-white/5"
          >
            Edit my look
          </Link>
          {confirmGuestLogout ? (
            <div role="alert" className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-3">
              <p className="text-sm font-black text-white">Log out of a guest account?</p>
              <p className="mt-1 text-xs leading-snug text-rose-100">
                You can&apos;t sign back in. Your coins, house and bike are lost for good. Connect TikTok first to keep them.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmGuestLogout(false)}
                  className="min-h-[44px] flex-1 rounded-lg bg-white/10 px-2 text-sm font-bold text-white"
                >
                  Keep playing
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => {
                    setOpen(false)
                    void logout()
                  }}
                  className="min-h-[44px] flex-1 rounded-lg bg-rose-500 px-2 text-sm font-black text-white disabled:opacity-40"
                >
                  Log out anyway
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => {
                if (!user.tiktokLinked) return setConfirmGuestLogout(true)
                setOpen(false)
                void logout()
              }}
              className="flex min-h-[44px] items-center rounded-xl px-3 text-left text-sm font-bold text-slate-300 hover:bg-white/5 disabled:opacity-40"
            >
              Log out
            </button>
          )}
        </div>
      )}
    </div>
  )
}
