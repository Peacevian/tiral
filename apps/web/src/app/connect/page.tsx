import Link from "next/link"
import { verifySwitchToken, type AccountSide } from "@/lib/session"

// A guest connected a TikTok that already has its own Tiral account. That
// account never takes a guest's progress, so before the guest is left behind
// the player sees both and decides.

function Side({ label, side, tone }: { label: string; side: AccountSide; tone: "guest" | "tiktok" }) {
  return (
    <div className={`rounded-2xl border p-3 ${tone === "tiktok" ? "border-flame/40 bg-flame-soft" : "border-sheet-line bg-sheet-card"}`}>
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-sheet-mute">{label}</div>
      <div className="mt-0.5 truncate text-base font-black text-sheet-ink">{side.name}</div>
      <div className="mt-1 font-mono text-sm font-bold text-sheet-blue">{side.balance.toLocaleString("en-US")} BNG</div>
      <div className="text-xs text-sheet-mute">{side.tier}</div>
    </div>
  )
}

export default async function ConnectPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams
  const claims = t ? await verifySwitchToken(t) : null
  return (
    <main className="min-h-dvh w-full bg-sheet px-4 py-10 text-sheet-ink">
      <div className="mx-auto w-full max-w-md">
        {!claims ? (
          <>
            <h1 className="text-xl font-black">That link has expired</h1>
            <p className="mt-2 text-sm text-sheet-mute">Nothing changed. Go back and connect TikTok again if you want to.</p>
            <Link href="/play" className="mt-4 inline-flex min-h-[48px] items-center rounded-xl bg-flame px-4 text-sm font-black text-white">
              Back to the game
            </Link>
          </>
        ) : (
          <>
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-flame-deep">Connect TikTok</div>
            <h1 className="mt-1 text-2xl font-black">This TikTok already has a Tiral account</h1>
            <p className="mt-2 text-sm text-sheet-mute">
              A TikTok account belongs to one player, so it can&apos;t take this guest&apos;s progress.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Side label="This guest" side={claims.guest} tone="guest" />
              <Side label="Your TikTok account" side={claims.owner} tone="tiktok" />
            </div>
            <p className="mt-4 rounded-xl border border-flame-deep/30 bg-flame-soft px-3 py-2 text-sm font-bold text-flame-deep">
              If you sign in to your TikTok account, this guest stays behind and you won&apos;t be able to get back to it.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Link href="/play" className="flex min-h-[48px] items-center justify-center rounded-xl bg-flame text-sm font-black text-white">
                Keep playing as {claims.guest.name}
              </Link>
              <form method="post" action="/api/auth/tiktok/switch">
                <input type="hidden" name="t" value={t} />
                <button
                  type="submit"
                  className="flex min-h-[48px] w-full items-center justify-center rounded-xl border border-sheet-line bg-sheet-card text-sm font-bold text-sheet-ink"
                >
                  Sign in to {claims.owner.name} anyway
                </button>
              </form>
            </div>
            <p className="mt-3 text-xs text-sheet-mute">
              Want to keep this guest for good? Connect a different TikTok account that hasn&apos;t played Tiral yet.
            </p>
          </>
        )}
      </div>
    </main>
  )
}
