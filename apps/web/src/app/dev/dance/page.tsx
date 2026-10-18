"use client"

import { useEffect, useRef, useState } from "react"
import { notFound } from "next/navigation"
import { Canvas } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import { DEFAULT_LOADOUT, type AvatarLoadout } from "@tiral/avatars"
import { RealisticAvatar } from "@/components/RealisticAvatar"
import { DANCE_MOVES, MOVE_BEATS, beatsAt, type DanceMoveId, type DanceState } from "@/lib/dance/moves"
import { startBeat, type BeatPlayer, type BeatStyle } from "@/lib/dance/beat"

const SLOTS = 8
const CAMERAS = { front: [0, 1.25, 3.4], angle: [2.5, 1.3, 2.4], side: [3.4, 1.2, 0] } as const
const START_ROUTINE: DanceMoveId[] = ["groove", "step", "clap", "handsUp", "sway", "point", "spin", "jump"]

// Development-only bench for the dance moves: tap a move to loop it, or build
// an eight-move routine and play it to the beat, on your own avatar.
export default function DanceBench() {
  if (process.env.NODE_ENV === "production") notFound()
  const [loadout, setLoadout] = useState<AvatarLoadout>(DEFAULT_LOADOUT)
  // ?routine=dab,floss,… starts with that routine.
  const [routine, setRoutine] = useState<DanceMoveId[]>(() => {
    const ids = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("routine")
    const picked = ids?.split(",").filter((id): id is DanceMoveId => DANCE_MOVES.some((move) => move.id === id))
    return picked?.length ? picked : START_ROUTINE
  })
  const [editing, setEditing] = useState(0)
  const [bpm, setBpm] = useState(108)
  const [style, setStyle] = useState<BeatStyle>("afro")
  const [dance, setDance] = useState<DanceState | null>(null)
  const playerRef = useRef<BeatPlayer | null>(null)
  const [beat, setBeat] = useState(0)
  const [camera] = useState<keyof typeof CAMERAS>(() =>
    typeof window === "undefined" ? "front" : ((new URLSearchParams(window.location.search).get("cam") as keyof typeof CAMERAS | null) ?? "front")
  )

  useEffect(() => {
    fetch("/api/profile")
      .then((response) => response.json())
      .then((data: { user?: { loadout?: AvatarLoadout | null } | null }) => {
        if (data.user?.loadout) setLoadout(data.user.loadout)
      })
      .catch(() => {})
  }, [])

  const play = (moves: DanceMoveId[]) => {
    playerRef.current?.stop()
    const started = startBeat(bpm, style)
    playerRef.current = started?.player ?? null
    setDance({ routine: moves, bpm, startedAt: started?.startedAt ?? performance.now() })
  }
  const stop = () => {
    playerRef.current?.stop()
    playerRef.current = null
    setDance(null)
  }
  useEffect(() => () => playerRef.current?.stop(), [])

  // For recording frame by frame: hold the routine at beat t.
  const routineRef = useRef(routine)
  routineRef.current = routine
  useEffect(() => {
    const frozenBpm = 1e-6
    ;(window as unknown as { __danceAt?: (t: number) => void }).__danceAt = (t) =>
      setDance({ routine: routineRef.current, bpm: frozenBpm, startedAt: performance.now() - (t * 60_000) / frozenBpm })
  }, [])

  // ?move=clap&t=0.5 holds that move at that beat (for checking poses).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const move = params.get("move") as DanceMoveId | null
    if (!move) return
    const t = Number(params.get("t") ?? 0)
    const frozenBpm = 1e-6
    setDance({ routine: [move], bpm: frozenBpm, startedAt: performance.now() - (t * 60_000) / frozenBpm })
  }, [])

  // Which slot is dancing now (for the highlight).
  useEffect(() => {
    if (!dance) return
    const id = setInterval(() => setBeat(beatsAt(dance, performance.now())), 60)
    return () => clearInterval(id)
  }, [dance])
  const playingSlot = dance && dance.routine.length === SLOTS && beat >= 0 ? Math.floor(beat / MOVE_BEATS) % SLOTS : -1

  return (
    <main className="flex h-dvh w-screen flex-col bg-sheet text-sheet-ink">
      <div className="relative min-h-0 flex-1">
        <Canvas camera={{ position: CAMERAS[camera], fov: 38 }} shadows dpr={[1, 1.5]}>
          <color attach="background" args={["#F4F8FD"]} />
          <hemisphereLight args={["#ffffff", "#cbd5e1", 1.1]} />
          <directionalLight position={[3, 6, 4]} intensity={2.2} castShadow />
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <circleGeometry args={[2.2, 48]} />
            <meshStandardMaterial color="#E85F0C" opacity={0.18} transparent />
          </mesh>
          <RealisticAvatar loadout={loadout} moving={false} dance={dance} />
          <OrbitControls target={[0, 0.95, 0]} enablePan={false} minDistance={2.5} maxDistance={7} />
        </Canvas>
        {dance && beat >= 0 && (
          <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-sheet-card/90 px-3 py-1 text-xs font-black text-flame-deep shadow">
            {[0, 1, 2, 3].map((i) => (Math.floor(beat) % 4 === i ? "●" : "○")).join(" ")}
          </div>
        )}
      </div>

      <div className="max-h-[52dvh] shrink-0 overflow-y-auto border-t border-sheet-line bg-sheet-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-sheet-mute">Your routine · tap a slot, then a move</p>
        <div className="grid grid-cols-8 gap-1">
          {routine.map((move, i) => {
            const info = DANCE_MOVES.find((m) => m.id === move)!
            return (
              <button
                key={i}
                type="button"
                onClick={() => setEditing(i)}
                className={`flex aspect-square flex-col items-center justify-center rounded-lg border-2 text-lg transition ${
                  playingSlot === i ? "border-flame bg-flame text-white" : editing === i ? "border-sheet-blue bg-sheet-soft" : "border-sheet-line bg-sheet"
                }`}
                title={info.name}
              >
                {info.emoji}
              </button>
            )
          })}
        </div>

        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => (dance && dance.routine === routine ? stop() : play(routine))}
            className="min-h-[44px] flex-1 rounded-xl bg-flame text-sm font-black text-white"
          >
            {dance && dance.routine === routine ? "■ Stop" : "▶ Dance the routine"}
          </button>
          {dance && dance.routine !== routine && (
            <button type="button" onClick={stop} className="min-h-[44px] rounded-xl border-2 border-flame px-4 text-sm font-black text-flame-deep">
              ■ Stop
            </button>
          )}
        </div>

        <p className="mb-1.5 mt-3 text-[11px] font-bold uppercase tracking-wide text-sheet-mute">Moves · tap to put in slot {editing + 1} and try it</p>
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
          {DANCE_MOVES.map((move) => (
            <button
              key={move.id}
              type="button"
              onClick={() => {
                setRoutine((current) => current.map((m, i) => (i === editing ? move.id : m)))
                setEditing((i) => (i + 1) % SLOTS)
                play([move.id])
              }}
              className="flex min-h-[52px] flex-col items-center justify-center rounded-xl border border-sheet-line bg-sheet text-[11px] font-bold text-sheet-ink active:scale-95"
            >
              <span className="text-lg leading-none">{move.emoji}</span>
              {move.name}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold text-sheet-mute">
          <span>Beat</span>
          {(["afro", "house"] as const).map((s) => (
            <button key={s} type="button" onClick={() => setStyle(s)} className={`rounded-lg px-2.5 py-1 ${style === s ? "bg-sheet-blue text-white" : "bg-sheet"}`}>
              {s === "afro" ? "Afrobeat" : "House"}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-1.5">
            {bpm} BPM
            <input type="range" min={84} max={132} step={4} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} />
          </label>
        </div>
      </div>
    </main>
  )
}
