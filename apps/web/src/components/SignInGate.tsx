"use client"

const AUTH_ERRORS: Record<string, string> = {
  tiktok_denied: "TikTok sign-in was cancelled.",
  invalid_state: "That sign-in link expired. Try again.",
  tiktok_failed: "TikTok sign-in failed. Try again or play as a guest.",
  tiktok_unavailable: "TikTok sign-in isn't available right now. Play as a guest instead."
}

// First thing a signed-out player sees: who are you before you race?
// A guest is a real account (coins, energy, rent all count); connecting
// TikTok later keeps everything.
export function SignInGate({
  busy,
  error,
  authError,
  onGuest
}: {
  busy: boolean
  error: string | null
  authError: string | null
  onGuest(): void
}) {
  const message = error ?? (authError ? AUTH_ERRORS[authError] ?? "Sign-in failed. Try again." : null)
  return (
    <div className="px-4 pb-4 pt-1">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-flame-deep">Tiral</div>
      <h2 className="mt-1 text-xl font-black text-sheet-ink">Who's running today?</h2>
      <p className="mt-1 text-sm leading-snug text-sheet-mute">
        Sign in to race, earn Banange Coins and keep your runner, your room and your rent.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <a
          href="/api/auth/tiktok"
          className="flex min-h-[48px] items-center justify-center rounded-xl bg-flame px-3 py-2 text-sm font-black text-white transition hover:bg-flame-dark"
        >
          Continue with TikTok
        </a>
        <button
          type="button"
          onClick={onGuest}
          disabled={busy}
          className="min-h-[48px] rounded-xl border-2 border-flame bg-sheet-card px-3 py-2 text-sm font-black text-flame-deep transition hover:bg-flame-soft disabled:opacity-40"
        >
          {busy ? "Setting you up…" : "Play as guest"}
        </button>
      </div>
      <p className="mt-2 text-[11px] leading-snug text-sheet-mute">
        Guests keep their progress on this device. Connect TikTok any time to keep it for good.
      </p>
      {message && <p className="mt-2 text-xs font-bold text-flame-deep">{message}</p>}
    </div>
  )
}
