import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Terms of Service — Tiral",
  description: "Terms of Service for the Tiral treasure-hunting game."
}

export default function TermsPage() {
  return (
    <div className="h-dvh w-full overflow-y-auto bg-slate-950">
      <main className="mx-auto w-full max-w-2xl bg-slate-950 px-6 pb-24 pt-12 text-slate-200 md:pb-12">
        <h1 className="text-3xl font-black text-white">Terms of Service</h1>
        <p className="mt-2 text-sm text-slate-400">Last updated: October 2026 · Tiral (“the Game”)</p>

        <section className="mt-8 space-y-4 text-sm leading-relaxed">
          <h2 className="text-lg font-bold text-white">1. What Tiral is</h2>
          <p>
            Tiral is a multiplayer, map-based treasure-hunting game set in Kampala, Uganda.
            Players join a race from a mobile browser, choose a starting point, and walk
            along real roads to find a hidden bounty before other players.
          </p>

          <h2 className="text-lg font-bold text-white">2. Accounts</h2>
          <p>
            You may play as a guest or log in with TikTok. If you log in with TikTok, we
            receive only your TikTok display name and avatar, which are shown to other
            players in races and results. You are responsible for keeping your TikTok
            account secure.
          </p>

          <h2 className="text-lg font-bold text-white">3. Fair play</h2>
          <p>
            Race positions are validated by our servers. Tampering with the game client,
            automating play, or exploiting bugs to gain an unfair advantage may result in
            suspension of your account.
          </p>

          <h2 className="text-lg font-bold text-white">4. Safety in the real world</h2>
          <p>
            Tiral is played on real streets. Always pay attention to traffic and your
            surroundings, obey local laws, and never enter private property or unsafe
            areas to reach a bounty. Bounties are placed on or near public roads only.
          </p>

          <h2 className="text-lg font-bold text-white">5. Availability</h2>
          <p>
            The Game is provided “as is” during its testing phase. Races, accounts, and
            rewards may be reset as we develop the game. We may suspend or discontinue
            the service at any time.
          </p>

          <h2 className="text-lg font-bold text-white">6. Contact</h2>
          <p>
            Questions about these terms:{" "}
            <span className="text-amber-300">smartskillsweb3@gmail.com</span>
          </p>

          <p className="pt-4">
            <Link href="/play" className="font-bold text-amber-400 hover:text-amber-300">
              ← Back to the game
            </Link>
          </p>
        </section>
      </main>
    </div>
  )
}
