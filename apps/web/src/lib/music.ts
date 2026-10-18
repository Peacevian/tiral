"use client"

import { useSyncExternalStore } from "react"

// Background music for the game: one looping track, paused while the tab is
// hidden, on/off remembered per device. It starts off: nothing plays when the
// site loads until the player turns it on with the 🎵 button (after that it
// comes back on their first tap or key press on later visits, since browsers
// block sound until then).
//
// The track is a ~770 KB download, fetched only once the music starts.
//
// Files live in public/music/ (licences in public/music/CREDITS.md). When the file is
// missing the button hides itself and nothing else happens.

export const TRACK = { src: "/music/lofi-v1.mp3", title: "Lofi Hip Hop Loop", artist: "OMF-Games" }

// A new key: "on" saved under the old one came from when music started by
// default, so it doesn't count as the player choosing it.
const STORAGE_KEY = "tiral-music-v2"
const VOLUME = 0.45

type MusicState = { enabled: boolean; playing: boolean; missing: boolean }

let state: MusicState = { enabled: false, playing: false, missing: false }
let audio: HTMLAudioElement | null = null
let started = false
const listeners = new Set<() => void>()

function emit(next: Partial<MusicState>) {
  state = { ...state, ...next }
  for (const listener of listeners) listener()
}

function readPreference(): boolean {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === "on") return true
    if (saved === "off") return false
  } catch {
    // storage blocked: fall through to the default
  }
  return false
}

function savePreference(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off")
  } catch {
    // not remembered this time; still works
  }
}

function getAudio(): HTMLAudioElement {
  if (audio) return audio
  audio = new Audio()
  audio.loop = true
  audio.volume = VOLUME
  // Nothing is downloaded until the music actually starts.
  audio.preload = "none"
  audio.addEventListener("playing", () => emit({ playing: true }))
  audio.addEventListener("pause", () => emit({ playing: false }))
  audio.addEventListener("error", () => emit({ missing: true, playing: false }))
  audio.src = TRACK.src
  return audio
}

function play() {
  if (!state.enabled || state.missing || document.visibilityState !== "visible") return
  void getAudio()
    .play()
    .catch(() => {
      // Blocked until a tap, or the file is missing (the error event says which).
    })
}

function pause() {
  audio?.pause()
}

/**
 * Call once the player is in the game. Starts the music on the first tap or
 * key press (or right away if the browser allows it).
 */
export function startMusic() {
  if (started || typeof window === "undefined") return
  started = true
  emit({ enabled: readPreference() })
  // Any tap or key press (re)starts it if it should be playing and isn't.
  const onGesture = () => {
    if (!audio || audio.paused) play()
  }
  window.addEventListener("pointerdown", onGesture, { passive: true })
  window.addEventListener("keydown", onGesture)
  document.addEventListener("visibilitychange", () => (document.visibilityState === "visible" ? play() : pause()))
  play()
}

export function setMusicEnabled(enabled: boolean) {
  savePreference(enabled)
  emit({ enabled })
  if (enabled) play()
  else pause()
}

export function useMusic(): MusicState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    () => state,
    () => state
  )
}
