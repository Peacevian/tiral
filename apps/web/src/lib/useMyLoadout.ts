"use client"

import { useEffect, useState } from "react"
import { DEFAULT_LOADOUT, type AvatarLoadout } from "@tiral/avatars"

export function useMyLoadout() {
  const [loadout, setLoadout] = useState<AvatarLoadout>(DEFAULT_LOADOUT)

  useEffect(() => {
    let cancelled = false
    fetch("/api/profile")
      .then(async (response) => {
        if (!response.ok) return null
        return (await response.json()) as {
          user: { loadout: AvatarLoadout } | null
        }
      })
      .then((body) => {
        if (!cancelled && body?.user) {
          setLoadout(body.user.loadout)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return loadout
}
