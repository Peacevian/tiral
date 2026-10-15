"use client"

import { DEFAULT_LOADOUT, type AvatarLoadout } from "@tiral/avatars"
import { usePlayer } from "@/lib/player"

/**
 * Your runner's look, from the player snapshot the app already loads once
 * (it used to fetch the whole /api/profile in every component that drew you).
 */
export function useMyLoadout(): AvatarLoadout {
  const { player } = usePlayer()
  return player?.user.loadout ?? DEFAULT_LOADOUT
}
