"use client"

import { usePathname } from "next/navigation"
import { useColyseusStatus } from "@/components/ColyseusProvider"
import { usePlayer } from "@/lib/player"

const SHELL_PAGES = ["/play", "/hustle", "/home", "/inbox", "/leaderboard", "/out"]

/**
 * The app shell (player bar + navigation) shows for signed-in players on the
 * game pages, and gets out of the way during a race or a map shift (LivTok
 * and the boda fleet are ordinary pages, so it stays for those).
 */
export function useShellVisible(): boolean {
  const pathname = usePathname() ?? "/"
  const { player } = usePlayer()
  const race = useColyseusStatus()
  if (!player) return false
  if (!SHELL_PAGES.some((page) => pathname === page || pathname.startsWith(`${page}/`))) return false
  if ((pathname.startsWith("/play") || pathname.startsWith("/hustle")) && (race.connected || race.reconnecting) && !race.screenRoom) return false
  return true
}
