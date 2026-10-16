import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Privacy Policy — Tiral",
  description: "Privacy Policy for the Tiral treasure-hunting game."
}

export default function PrivacyPage() {
  return (
    <div className="h-dvh w-full overflow-y-auto bg-sheet">
      <main className="mx-auto w-full max-w-2xl bg-sheet px-6 pb-24 pt-12 text-sheet-ink md:pb-12">
        <h1 className="text-3xl font-black text-sheet-ink">Privacy Policy</h1>
        <p className="mt-2 text-sm text-sheet-mute">Last updated: October 2026 · Tiral (“the Game”)</p>

        <section className="mt-8 space-y-4 text-sm leading-relaxed">
          <h2 className="text-lg font-bold text-sheet-ink">1. Data we collect</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-sheet-ink">Guest players:</strong> a random nickname and
              gameplay data (race participation, positions, results).
            </li>
            <li>
              <strong className="text-sheet-ink">TikTok login:</strong> your TikTok display
              name and avatar, plus the technical tokens needed to keep you logged in.
              We do not access your videos, followers, messages, or anything beyond the
              basic profile scope you approve.
            </li>
            <li>
              <strong className="text-sheet-ink">Gameplay data:</strong> your in-race
              positions along public roads, race results, and device/connection data
              needed to run multiplayer races.
            </li>
          </ul>

          <h2 className="text-lg font-bold text-sheet-ink">2. How we use it</h2>
          <p>
            To operate races, show your name and avatar to other players, keep you
            logged in, prevent cheating, and improve the game. We do not sell personal
            data and we do not use it for advertising.
          </p>

          <h2 className="text-lg font-bold text-sheet-ink">3. Location data</h2>
          <p>
            Your avatar moves along roads you choose in the game. We do not track your
            real-world GPS location — movement is game input only.
          </p>

          <h2 className="text-lg font-bold text-sheet-ink">4. Data sharing</h2>
          <p>
            Your display name and avatar are visible to other players in races and
            results. TikTok login is processed under TikTok’s own privacy policy in
            addition to this one. We disclose data to authorities only when required
            by law.
          </p>

          <h2 className="text-lg font-bold text-sheet-ink">5. Retention and deletion</h2>
          <p>
            Gameplay data is kept while your account is active. To delete your account
            and data, email{" "}
            <span className="text-flame-deep">smartskillsweb3@gmail.com</span> from the
            address associated with your account. TikTok access tokens are revoked on
            logout.
          </p>

          <h2 className="text-lg font-bold text-sheet-ink">6. Children</h2>
          <p>
            Tiral is not directed at children under 13, and TikTok login is subject to
            TikTok’s own age requirements.
          </p>

          <h2 className="text-lg font-bold text-sheet-ink">7. Contact</h2>
          <p>
            Privacy questions:{" "}
            <span className="text-flame-deep">smartskillsweb3@gmail.com</span>
          </p>

          <p className="pt-4">
            <Link href="/play" className="font-bold text-flame-deep hover:text-flame-deep">
              ← Back to the game
            </Link>
          </p>
        </section>
      </main>
    </div>
  )
}
