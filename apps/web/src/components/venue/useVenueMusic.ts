"use client"

import { useEffect, useRef, useState } from "react"
import { startBeat, type BeatPlayer, type BeatStyle } from "@/lib/dance/beat"

// The DJ at Kyadondo: beats made in the browser (no files, no licences),
// changing every couple of minutes, louder the closer you are to the stage.
// The crowd's dancing and the stage lights follow whatever is playing.

const SET: ReadonlyArray<{ bpm: number; style: BeatStyle }> = [
  { bpm: 104, style: "afro" },
  { bpm: 112, style: "afro" },
  { bpm: 122, style: "house" },
  { bpm: 98, style: "afro" },
  { bpm: 118, style: "house" }
]
const TRACK_MS = 150_000
const STAGE = { x: 26, z: 46 }
const STORAGE_KEY = "tiral-venue-sound"

export function useVenueMusic(active: boolean, where: () => { x: number; z: number } | null, evening: boolean) {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== "off"
    } catch {
      return true
    }
  })
  const [beat, setBeat] = useState<{ bpm: number; startedAt: number } | null>(null)
  const player = useRef<BeatPlayer | null>(null)
  const whereRef = useRef(where)
  whereRef.current = where

  // The set: a new beat every TRACK_MS.
  useEffect(() => {
    if (!active) return
    let track = Math.floor(Date.now() / TRACK_MS) % SET.length
    const play = () => {
      player.current?.stop()
      player.current = null
      const next = SET[track % SET.length]!
      if (on) {
        const started = startBeat(next.bpm, next.style)
        player.current = started?.player ?? null
        setBeat({ bpm: next.bpm, startedAt: started?.startedAt ?? performance.now() })
      } else {
        // Muted: the party goes on (dancers keep time), you just don't hear it.
        setBeat({ bpm: next.bpm, startedAt: performance.now() })
      }
      track++
    }
    play()
    const id = setInterval(play, TRACK_MS)
    return () => {
      clearInterval(id)
      player.current?.stop()
      player.current = null
    }
  }, [active, on])

  // Louder near the stage.
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => {
      const at = whereRef.current()
      if (!at || !player.current) return
      const distance = Math.hypot(at.x - STAGE.x, at.z - STAGE.z)
      player.current.setVolume(Math.max(0.12, Math.min(1, 1 - distance / 110)) * (evening ? 1 : 0.75))
    }, 400)
    return () => clearInterval(id)
  }, [active, evening])

  const toggle = () => {
    setOn((value) => {
      try {
        localStorage.setItem(STORAGE_KEY, value ? "off" : "on")
      } catch {
        // not remembered this time
      }
      return !value
    })
  }
  return { on, toggle, beat }
}
