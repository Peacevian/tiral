"use client"

// A dance beat made in the browser with Web Audio: kick, clap, shaker and a
// bass line, scheduled ahead of time so it never drifts. Because the game
// makes the beat itself it knows exactly where every beat lands, which keeps
// the avatar on it (and later, scores taps against it). No audio files, no
// licences.

export type BeatStyle = "afro" | "house"

const LOOKAHEAD_S = 0.2
const TICK_MS = 50
// Bass notes (Hz) for each bar of a four-bar loop.
const BASS: Record<BeatStyle, number[]> = { afro: [55, 55, 65.4, 49], house: [41.2, 41.2, 49, 55] }

let shared: AudioContext | null = null
function context() {
  if (typeof window === "undefined") return null
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  shared ??= new Ctor()
  return shared
}

let noise: AudioBuffer | null = null
function noiseBuffer(ctx: AudioContext) {
  if (noise) return noise
  noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate)
  const data = noise.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return noise
}

function kick(ctx: AudioContext, out: AudioNode, at: number) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.frequency.setValueAtTime(150, at)
  osc.frequency.exponentialRampToValueAtTime(45, at + 0.12)
  gain.gain.setValueAtTime(0.9, at)
  gain.gain.exponentialRampToValueAtTime(0.001, at + 0.35)
  osc.connect(gain).connect(out)
  osc.start(at)
  osc.stop(at + 0.36)
}

function hiss(ctx: AudioContext, out: AudioNode, at: number, { length, level, freq }: { length: number; level: number; freq: number }) {
  const source = ctx.createBufferSource()
  source.buffer = noiseBuffer(ctx)
  const filter = ctx.createBiquadFilter()
  filter.type = "highpass"
  filter.frequency.value = freq
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(level, at)
  gain.gain.exponentialRampToValueAtTime(0.001, at + length)
  source.connect(filter).connect(gain).connect(out)
  source.start(at)
  source.stop(at + length + 0.01)
}

function clap(ctx: AudioContext, out: AudioNode, at: number) {
  // A few quick bursts read as hands clapping.
  for (const offset of [0, 0.012, 0.024]) hiss(ctx, out, at + offset, { length: 0.12, level: 0.35, freq: 1200 })
}

function bass(ctx: AudioContext, out: AudioNode, at: number, freq: number, length: number) {
  const osc = ctx.createOscillator()
  osc.type = "triangle"
  osc.frequency.value = freq
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(0.35, at + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.001, at + length)
  osc.connect(gain).connect(out)
  osc.start(at)
  osc.stop(at + length + 0.02)
}

/** One sixteenth-note step of the pattern (16 steps a bar). */
function step(ctx: AudioContext, out: AudioNode, style: BeatStyle, index: number, at: number, sixteenth: number) {
  const s = index % 16
  const bar = Math.floor(index / 16) % 4
  if (style === "house") {
    if (s % 4 === 0) kick(ctx, out, at)
    if (s === 4 || s === 12) clap(ctx, out, at)
    if (s % 4 === 2) hiss(ctx, out, at, { length: 0.09, level: 0.22, freq: 7000 })
    if (s % 4 === 2) bass(ctx, out, at, BASS.house[bar]!, sixteenth * 1.8)
    return
  }
  // Afrobeat-style: kick on 1 and the "and" of 2 and 3, claps on 2 and 4,
  // a busy shaker, and a bouncing bass.
  if (s === 0 || s === 6 || s === 10) kick(ctx, out, at)
  if (s === 4 || s === 12) clap(ctx, out, at)
  hiss(ctx, out, at, { length: 0.05, level: s % 2 === 0 ? 0.12 : 0.07, freq: 6000 })
  if (s === 0 || s === 3 || s === 7 || s === 10) bass(ctx, out, at, BASS.afro[bar]! * (s === 7 ? 1.5 : 1), sixteenth * 2.5)
}

export type BeatPlayer = { stop(): void }

/**
 * Start a beat; returns the player and `startedAt`, performance.now() of beat 0
 * as it reaches the speakers (what a DanceState wants).
 */
export function startBeat(bpm: number, style: BeatStyle = "afro"): { player: BeatPlayer; startedAt: number } | null {
  const ctx = context()
  if (!ctx) return null
  void ctx.resume()
  const out = ctx.createGain()
  out.gain.value = 0.8
  out.connect(ctx.destination)
  const sixteenth = 60 / bpm / 4
  const lead = 0.15
  const t0 = ctx.currentTime + lead
  let next = 0
  const schedule = () => {
    while (t0 + next * sixteenth < ctx.currentTime + LOOKAHEAD_S) {
      step(ctx, out, style, next, t0 + next * sixteenth, sixteenth)
      next++
    }
  }
  schedule()
  const timer = setInterval(schedule, TICK_MS)
  const latency = (ctx.outputLatency || ctx.baseLatency || 0) * 1000
  return {
    player: {
      stop() {
        clearInterval(timer)
        out.gain.setTargetAtTime(0, ctx.currentTime, 0.05)
        setTimeout(() => out.disconnect(), 400)
      }
    },
    startedAt: performance.now() + lead * 1000 + latency
  }
}
