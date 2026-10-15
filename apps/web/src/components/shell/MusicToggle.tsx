"use client"

import { useEffect } from "react"
import { TRACK, setMusicEnabled, startMusic, useMusic } from "@/lib/music"

/** 🎵 on/off for the background music; starts the music once mounted (in game). */
export function MusicToggle() {
  const { enabled, playing, missing } = useMusic()
  useEffect(() => startMusic(), [])
  if (missing) return null
  const label = enabled ? `Music on: ${TRACK.title} by ${TRACK.artist}. Tap to mute` : "Music off. Tap to play"
  return (
    <button
      type="button"
      onClick={() => setMusicEnabled(!enabled)}
      aria-pressed={enabled}
      aria-label={label}
      title={label}
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-base ${
        enabled ? "border-amber-300/40 bg-amber-300/10" : "border-white/10 bg-white/5 opacity-70"
      }`}
    >
      <span aria-hidden className={playing ? "animate-pulse" : undefined}>
        {enabled ? "🎵" : "🔇"}
      </span>
    </button>
  )
}
