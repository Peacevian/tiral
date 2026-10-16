import { ServerError } from "@colyseus/core"
import { findHustle, gigLockedText } from "@tiral/game-core"
import { announceLadderUnlocks, ladderCounts } from "@tiral/db"
import { withRetry } from "./retry.js"

/** Refuse to start a gig the player hasn't unlocked on the hustle ladder yet. */
export async function refuseLockedGig(userId: string, gig: string): Promise<void> {
  const counts = await withRetry("Ladder check", () => ladderCounts(userId))
  const locked = gigLockedText(gig, counts)
  if (locked) throw new ServerError(403, locked)
}

/** After a paid job: inbox note for each gig just unlocked, and a heads-up in the shift. */
export function announceUnlocks(userId: string, tell: (text: string) => void): void {
  void announceLadderUnlocks(userId)
    .then((gigs) => {
      for (const gig of gigs) tell(`🔓 New hustle unlocked: ${findHustle(gig)?.name ?? gig}! Check your inbox.`)
    })
    .catch((error) => console.error("Ladder unlock note failed:", error))
}
