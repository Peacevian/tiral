// Dance moves for the rigged avatar, made in code (the model has no dance
// clips). A move is a pose as a function of time in beats: where each limb
// points, plus hip and whole-body motion. Every move lasts two beats and loops,
// so a routine is just a list of moves, each played for two beats.
//
// Directions are in model space: +Y up, +Z forward, and X *outward* from the
// side the limb is on (positive = away from the body). The right side is
// mirrored when the pose is applied, so a symmetric move writes one side.

export type Vec = [number, number, number]

export type Limb = { upper: Vec; lower: Vec }

export type DanceFrame = {
  torso: Vec
  head: Vec
  armL: Limb
  armR: Limb
  legL: Limb
  legR: Limb
  /** Pelvis turn and tilt (radians). */
  hipsYaw: number
  hipsRoll: number
  /** Whole-body turn (radians), sideways shift and hop height (metres). */
  yaw: number
  shiftX: number
  lift: number
}

export const MOVE_BEATS = 2

export const DANCE_MOVES = [
  { id: "groove", name: "Groove", emoji: "🕺" },
  { id: "step", name: "Side step", emoji: "👣" },
  { id: "sway", name: "Hip sway", emoji: "💃" },
  { id: "handsUp", name: "Hands up", emoji: "🙌" },
  { id: "clap", name: "Clap", emoji: "👏" },
  { id: "shimmy", name: "Shimmy", emoji: "✨" },
  { id: "spin", name: "Spin", emoji: "🌀" },
  { id: "jump", name: "Jump", emoji: "🦘" },
  { id: "point", name: "Disco point", emoji: "👆" },
  { id: "kick", name: "Kick", emoji: "🦵" },
  { id: "wave", name: "Arm wave", emoji: "🌊" },
  { id: "runningMan", name: "Running man", emoji: "🏃" },
  { id: "floss", name: "Floss", emoji: "🧵" },
  { id: "dab", name: "Dab", emoji: "😎" },
  { id: "robot", name: "Robot", emoji: "🤖" },
  { id: "shaku", name: "Shaku shaku", emoji: "🔥" },
  { id: "gwara", name: "Gwara gwara", emoji: "🌀" },
  { id: "raiseRoof", name: "Raise the roof", emoji: "🏠" },
  { id: "twist", name: "Twist", emoji: "🔄" },
  { id: "drop", name: "Drop it", emoji: "⬇️" },
  { id: "azonto", name: "Azonto", emoji: "🚗" },
  { id: "kadodi", name: "Kadodi stomp", emoji: "🥁" }
] as const

export type DanceMoveId = (typeof DANCE_MOVES)[number]["id"]

const TAU = Math.PI * 2
/** 1 on each beat, 0 halfway between: the "down" of a bounce. */
const dip = (t: number) => 0.5 + 0.5 * Math.cos(TAU * t)
/** +1 on even beats, −1 on odd ones, smooth in between: left/right alternation. */
const alt = (t: number) => Math.cos(Math.PI * t)
const mix = (a: Vec, b: Vec, w: number): Vec => [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w]
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const smooth = (x: number) => {
  const c = clamp01(x)
  return c * c * (3 - 2 * c)
}

/** A standing leg with the knee bent by `k` (0 straight … 1 deep). */
const leg = (k: number, out = 0.08): Limb => ({ upper: [out, -1, 0.06 + 0.55 * k], lower: [out * 0.6, -1, -0.04 - 0.7 * k] })
const RELAXED_ARM: Limb = { upper: [0.22, -1, 0.05], lower: [0.15, -1, 0.3] }
const BENT_ARM: Limb = { upper: [0.3, -1, 0.2], lower: [0.12, -0.25, 1] }

function base(t: number): DanceFrame {
  const d = dip(t)
  return {
    torso: [0, 1, 0.06],
    head: [0, 1, 0.08 + 0.12 * d],
    armL: RELAXED_ARM,
    armR: RELAXED_ARM,
    legL: leg(0.12 + 0.25 * d),
    legR: leg(0.12 + 0.25 * d),
    hipsYaw: 0,
    hipsRoll: 0,
    yaw: 0,
    shiftX: 0,
    lift: 0
  }
}

const MOVES: Record<DanceMoveId, (t: number) => DanceFrame> = {
  // Knees bounce on the beat, elbows bent and swinging, hips turning.
  groove: (t) => {
    const a = alt(t)
    return {
      ...base(t),
      armL: { upper: [0.28, -1, 0.25 + 0.3 * a], lower: [0.1, -0.2, 1] },
      armR: { upper: [0.28, -1, 0.25 - 0.3 * a], lower: [0.1, -0.2, 1] },
      hipsYaw: 0.18 * a,
      torso: [0, 1, 0.1]
    }
  },

  // Step out to one side, then the other; the free leg reaches out.
  step: (t) => {
    const a = alt(t)
    const d = dip(t)
    const left = Math.max(0, a)
    const right = Math.max(0, -a)
    return {
      ...base(t),
      shiftX: 0.13 * a,
      legL: { upper: [0.08 + 0.32 * right, -1, 0.08 + 0.2 * d], lower: [0.05 + 0.25 * right, -1, -0.06 - 0.3 * d] },
      legR: { upper: [0.08 + 0.32 * left, -1, 0.08 + 0.2 * d], lower: [0.05 + 0.25 * left, -1, -0.06 - 0.3 * d] },
      armL: { upper: [0.35 + 0.25 * left, -1, 0.2], lower: [0.2, -0.3, 1] },
      armR: { upper: [0.35 + 0.25 * right, -1, 0.2], lower: [0.2, -0.3, 1] },
      torso: [-0.08 * a, 1, 0.08]
    }
  },

  // Hips roll side to side, shoulders lean against them, arms out low.
  sway: (t) => {
    const a = alt(t)
    return {
      ...base(t),
      hipsRoll: 0.2 * a,
      torso: [-0.18 * a, 1, 0.05],
      head: [0.1 * a, 1, 0.1],
      legL: leg(0.15 + 0.3 * Math.max(0, -a)),
      legR: leg(0.15 + 0.3 * Math.max(0, a)),
      armL: { upper: [0.7, -1, 0.25], lower: [0.6, -0.35 + 0.35 * a, 0.7] },
      armR: { upper: [0.7, -1, 0.25], lower: [0.6, -0.35 - 0.35 * a, 0.7] }
    }
  },

  // Both arms up, pumping on the beat.
  handsUp: (t) => {
    const d = dip(t)
    const fore = mix([-0.3, 0.6, 0.6], [0.15, 1, 0.05], d)
    return {
      ...base(t),
      armL: { upper: [0.4, 1, 0.12], lower: fore },
      armR: { upper: [0.4, 1, 0.12], lower: fore },
      legL: leg(0.1 + 0.35 * d),
      legR: leg(0.1 + 0.35 * d),
      head: [0, 1, -0.1 + 0.15 * d]
    }
  },

  // Hands meet in front on every beat.
  clap: (t) => {
    const d = smooth((dip(t) - 0.35) / 0.65)
    return {
      ...base(t),
      armL: { upper: mix([0.55, -0.8, 0.45], [0.2, -0.45, 1], d), lower: mix([0.55, -0.1, 0.9], [-0.42, 0.2, 1], d) },
      armR: { upper: mix([0.55, -0.8, 0.45], [0.2, -0.45, 1], d), lower: mix([0.55, -0.1, 0.9], [-0.42, 0.2, 1], d) },
      torso: [0, 1, 0.12 * d]
    }
  },

  // Fast shoulder shake, low and bent.
  shimmy: (t) => {
    const s = Math.sin(TAU * 2 * t)
    return {
      ...base(t),
      torso: [0.22 * s, 1, 0.18],
      head: [-0.08 * s, 1, 0.15],
      armL: { upper: [0.45, -0.8, 0.5 + 0.25 * s], lower: [0.1, 0, 1] },
      armR: { upper: [0.45, -0.8, 0.5 - 0.25 * s], lower: [0.1, 0, 1] },
      legL: leg(0.45),
      legR: leg(0.45),
      hipsYaw: 0.1 * s
    }
  },

  // A full turn over two beats, arms out.
  spin: (t) => {
    const turn = smooth(t / MOVE_BEATS)
    return {
      ...base(t),
      yaw: TAU * turn,
      armL: { upper: [1, 0.15, 0], lower: [1, 0.25, 0.1] },
      armR: { upper: [1, 0.15, 0], lower: [1, 0.25, 0.1] },
      legL: leg(0.25, 0.04),
      legR: leg(0.25, 0.04)
    }
  },

  // Crouch on the beat, jump up with the arms, land on the next.
  jump: (t) => {
    const air = t > 0.35 && t < 1.65 ? Math.sin((Math.PI * (t - 0.35)) / 1.3) : 0
    const crouch = air > 0 ? 0.1 : t < 0.35 ? smooth(t / 0.35) * 0.75 : smooth((MOVE_BEATS - t) / 0.35) * 0.6
    const arm: Limb = air > 0 ? { upper: [0.45, 1, 0.1], lower: [0.3, 1, 0] } : { upper: [0.2, -1, -0.5], lower: [0.15, -1, -0.3] }
    return {
      ...base(t),
      lift: 0.32 * air,
      legL: leg(crouch + 0.25 * air),
      legR: leg(crouch + 0.25 * air),
      armL: arm,
      armR: arm,
      torso: [0, 1, 0.25 * crouch]
    }
  },

  // Right hand up to the sky, then down across the body; left hand on the hip.
  point: (t) => {
    const a = alt(t)
    const up = smooth((a + 1) / 2)
    return {
      ...base(t),
      armR: { upper: mix([0.12, -1, 0.5], [0.55, 1, 0.3], up), lower: mix([-0.2, -1, 0.55], [0.5, 1, 0.3], up) },
      // Hand on the hip: elbow out and back, forearm down and in.
      armL: { upper: [0.75, -0.75, -0.3], lower: [-0.55, -0.55, 0.3] },
      hipsYaw: -0.2 * a,
      hipsRoll: 0.08 * a,
      torso: [0.1 * a, 1, 0.05],
      head: [-0.2 * up, 1, 0.1]
    }
  },

  // Kick forward with one leg, then the other.
  kick: (t) => {
    const a = alt(t)
    const kickL = smooth(a)
    const kickR = smooth(-a)
    const kicking = (k: number): Limb => ({ upper: mix([0.08, -1, 0.2], [0.1, -0.35, 1], k), lower: mix([0.05, -1, -0.3], [0.06, -0.3, 1], k) })
    return {
      ...base(t),
      legL: kickL > 0 ? kicking(kickL) : leg(0.25),
      legR: kickR > 0 ? kicking(kickR) : leg(0.25),
      armL: { upper: [0.3, -1, 0.2 - 0.6 * kickL + 0.4 * kickR], lower: [0.1, -0.3, 1] },
      armR: { upper: [0.3, -1, 0.2 - 0.6 * kickR + 0.4 * kickL], lower: [0.1, -0.3, 1] },
      torso: [0, 1, -0.06 * (kickL + kickR)]
    }
  },

  // Arms out to the sides, a wave rippling from one hand to the other.
  wave: (t) => {
    const p = Math.PI * t
    return {
      ...base(t),
      armL: { upper: [1, 0.35 * Math.sin(p), 0.05], lower: [1, 0.7 * Math.sin(p - 1.1), 0.05] },
      armR: { upper: [1, 0.35 * Math.sin(p - 2.2), 0.05], lower: [1, 0.7 * Math.sin(p - 3.3), 0.05] },
      torso: [0.12 * Math.sin(p - 1.6), 1, 0.05],
      head: [0.1 * Math.sin(p - 1.6), 1, 0.1]
    }
  },
  // One knee up in front while the other foot slides back, swapping each beat.
  runningMan: (t) => {
    const a = alt(t)
    const upL = smooth((a + 1) / 2)
    const upR = 1 - upL
    const legFor = (up: number): Limb => ({
      upper: mix([0.08, -1, -0.35], [0.08, -0.25, 1], up),
      lower: mix([0.05, -1, -0.65], [0.05, -1, 0.05], up)
    })
    return {
      ...base(t),
      legL: legFor(upL),
      legR: legFor(upR),
      armL: { upper: [0.25, -1, 0.5 - upL], lower: [0.1, 0.1, 1] },
      armR: { upper: [0.25, -1, 0.5 - upR], lower: [0.1, 0.1, 1] },
      torso: [0, 1, 0.12],
      lift: 0.05 * (1 - dip(t))
    }
  },

  // Straight arms swing side to side past the hips, one in front, one behind;
  // the hips swing the other way.
  floss: (t) => {
    const s = Math.sin(TAU * t)
    const z = 0.35 * Math.cos(TAU * t)
    return {
      ...base(t),
      armL: { upper: [0.55 * s, -1, z], lower: [0.6 * s, -1, z] },
      armR: { upper: [-0.55 * s, -1, -z], lower: [-0.6 * s, -1, -z] },
      shiftX: -0.06 * s,
      hipsRoll: 0.14 * s,
      legL: leg(0.2),
      legR: leg(0.2)
    }
  },

  // Hit the dab on the beat and hold it, then bounce back out.
  dab: (t) => {
    const hold = t < 1.2 ? smooth(t / 0.2) : smooth((MOVE_BEATS - t) / 0.5)
    return {
      ...base(t),
      armL: { upper: mix(RELAXED_ARM.upper, [1, 0.55, 0.15], hold), lower: mix(RELAXED_ARM.lower, [1, 0.6, 0.15], hold) },
      armR: { upper: mix(RELAXED_ARM.upper, [-0.25, 0.35, 1], hold), lower: mix(RELAXED_ARM.lower, [-1, 0.45, 0.1], hold) },
      head: mix([0, 1, 0.1], [-0.45, 0.5, 0.75], hold),
      torso: [-0.12 * hold, 1, 0.1 * hold]
    }
  },

  // Stiff, ticking moves: everything holds, then snaps, every half beat.
  robot: (t) => {
    const tick = Math.floor(t * 2)
    const side = tick % 2 === 0 ? 1 : -1
    const high = tick % 4 < 2
    return {
      ...base(0),
      hipsYaw: 0.3 * side,
      armL: { upper: [0.25, -1, high ? 0.6 : 0], lower: high ? [0.05, 0.3, 1] : [0.05, 0, 1] },
      armR: { upper: [0.25, -1, high ? 0 : 0.6], lower: high ? [0.05, 0, 1] : [0.05, 0.3, 1] },
      head: [0.35 * side, 1, 0.05],
      legL: leg(0.1),
      legR: leg(0.1)
    }
  },

  // Low and leaning in, hands crossing in front, feet shuffling.
  shaku: (t) => {
    const a = alt(t)
    const crossL = Math.max(0, a)
    const crossR = Math.max(0, -a)
    return {
      ...base(t),
      torso: [0, 1, 0.4],
      head: [0, 1, 0.2],
      legL: { upper: [0.12, -1, 0.35 + 0.25 * crossR], lower: [0.06, -1, -0.45 - 0.3 * crossL] },
      legR: { upper: [0.12, -1, 0.35 + 0.25 * crossL], lower: [0.06, -1, -0.45 - 0.3 * crossR] },
      armL: { upper: [0.25, -0.75, 0.75], lower: [0.5 - 1.1 * crossL, -0.45, 0.8] },
      armR: { upper: [0.25, -0.75, 0.75], lower: [0.5 - 1.1 * crossR, -0.45, 0.8] },
      shiftX: 0.05 * a
    }
  },

  // A leg swings up and out while the arm on that side rolls over the head;
  // left on the first beat, right on the second.
  gwara: (t) => {
    const leftSide = t < 1
    const u = Math.sin(Math.PI * (t % 1))
    const swingLeg: Limb = { upper: mix([0.08, -1, 0.1], [0.75, -0.35, 0.45], u), lower: mix([0.05, -1, -0.1], [0.35, -1, 0.1], u) }
    const rollArm: Limb = { upper: mix([0.3, -1, 0.2], [0.45, 1, 0.25], u), lower: mix([0.15, -1, 0.3], [-0.6, 0.75, 0.3], u) }
    return {
      ...base(t),
      legL: leftSide ? swingLeg : leg(0.25),
      legR: leftSide ? leg(0.25) : swingLeg,
      armL: leftSide ? rollArm : BENT_ARM,
      armR: leftSide ? BENT_ARM : rollArm,
      torso: [(leftSide ? -0.2 : 0.2) * u, 1, 0.05],
      hipsRoll: (leftSide ? 0.15 : -0.15) * u
    }
  },

  // Palms pushing the ceiling up, twice a beat.
  raiseRoof: (t) => {
    const push = 0.5 + 0.5 * Math.cos(TAU * 2 * t)
    return {
      ...base(t),
      armL: { upper: [0.75, 0.15 + 0.6 * push, 0.15], lower: [0.05, 1, 0.1] },
      armR: { upper: [0.75, 0.15 + 0.6 * push, 0.15], lower: [0.05, 1, 0.1] },
      head: [0, 1, -0.05 + 0.2 * push]
    }
  },

  // Hips twist one way, shoulders the other, knees soft.
  twist: (t) => {
    const s = Math.sin(TAU * t)
    return {
      ...base(t),
      hipsYaw: 0.55 * s,
      yaw: -0.25 * s,
      legL: leg(0.35),
      legR: leg(0.35),
      armL: { upper: [0.45, -0.8, 0.35 + 0.35 * s], lower: [0.15, 0.1, 1] },
      armR: { upper: [0.45, -0.8, 0.35 - 0.35 * s], lower: [0.15, 0.1, 1] },
      torso: [0, 1, 0.12]
    }
  },

  // Drop down low on the beat, hands on the knees, and come back up.
  drop: (t) => {
    const low = t < 1.3 ? smooth(t / 0.4) : smooth((MOVE_BEATS - t) / 0.7)
    const squat: Limb = { upper: [0.3, -0.55, 1], lower: [0.1, -1, -0.45] }
    const legPose: Limb = { upper: mix(leg(0.15).upper, squat.upper, low), lower: mix(leg(0.15).lower, squat.lower, low) }
    return {
      ...base(t),
      legL: legPose,
      legR: legPose,
      armL: { upper: mix(RELAXED_ARM.upper, [0.4, -0.75, 0.75], low), lower: mix(RELAXED_ARM.lower, [0.05, -1, 0.35], low) },
      armR: { upper: mix(RELAXED_ARM.upper, [0.4, -0.75, 0.75], low), lower: mix(RELAXED_ARM.lower, [0.05, -1, 0.35], low) },
      torso: [0, 1, 0.45 * low],
      head: [0, 1, 0.1 + 0.2 * low]
    }
  },

  // Hands on an imaginary steering wheel, turning it with the beat.
  azonto: (t) => {
    const turn = Math.sin(Math.PI * t)
    return {
      ...base(t),
      armL: { upper: [0.3, -0.55, 1], lower: [-0.35, 0.15 + 0.35 * turn, 1] },
      armR: { upper: [0.3, -0.55, 1], lower: [-0.35, 0.15 - 0.35 * turn, 1] },
      hipsRoll: 0.12 * alt(t),
      torso: [0.1 * turn, 1, 0.12],
      head: [0.15 * turn, 1, 0.1]
    }
  },

  // Kadodi: a stomping hop on every beat, knees high in turn, arms pumping.
  kadodi: (t) => {
    const phase = t % 1
    const air = Math.sin(Math.PI * phase)
    const leftUp = Math.floor(t) % 2 === 0
    const knee: Limb = { upper: [0.1, -0.2, 1], lower: [0.05, -1, 0.15] }
    const pump = 0.5 + 0.5 * Math.cos(TAU * t)
    const arm: Limb = { upper: [0.35, -0.6 + 0.6 * (1 - pump), 0.45], lower: [0.1, 0.6, 1] }
    return {
      ...base(t),
      lift: 0.12 * air,
      legL: leftUp ? { upper: mix(leg(0.2).upper, knee.upper, air), lower: mix(leg(0.2).lower, knee.lower, air) } : leg(0.2 + 0.2 * (1 - air)),
      legR: leftUp ? leg(0.2 + 0.2 * (1 - air)) : { upper: mix(leg(0.2).upper, knee.upper, air), lower: mix(leg(0.2).lower, knee.lower, air) },
      armL: arm,
      armR: arm,
      torso: [0, 1, 0.15]
    }
  }
}

function blend(a: DanceFrame, b: DanceFrame, w: number): DanceFrame {
  const limb = (x: Limb, y: Limb): Limb => ({ upper: mix(x.upper, y.upper, w), lower: mix(x.lower, y.lower, w) })
  const n = (x: number, y: number) => x + (y - x) * w
  return {
    torso: mix(a.torso, b.torso, w),
    head: mix(a.head, b.head, w),
    armL: limb(a.armL, b.armL),
    armR: limb(a.armR, b.armR),
    legL: limb(a.legL, b.legL),
    legR: limb(a.legR, b.legR),
    hipsYaw: n(a.hipsYaw, b.hipsYaw),
    hipsRoll: n(a.hipsRoll, b.hipsRoll),
    // A finished spin is a whole turn: same as facing forward.
    yaw: n(a.yaw % TAU, b.yaw % TAU),
    shiftX: n(a.shiftX, b.shiftX),
    lift: n(a.lift, b.lift)
  }
}

/** How long a move change takes to blend in, in beats. */
const BLEND_BEATS = 0.3

/** The pose `beats` into a routine (looping), blending into each new move. */
export function danceFrame(routine: readonly DanceMoveId[], beats: number): DanceFrame | null {
  if (routine.length === 0 || beats < 0) return null
  const slot = Math.floor(beats / MOVE_BEATS)
  const t = beats - slot * MOVE_BEATS
  const move = routine[slot % routine.length]!
  const frame = MOVES[move](t)
  if (t >= BLEND_BEATS || slot === 0) return frame
  const previous = routine[(slot - 1) % routine.length]!
  if (previous === move) return frame
  return blend(MOVES[previous](t + MOVE_BEATS), frame, smooth(t / BLEND_BEATS))
}

/** A routine playing to a beat; `startedAt` is performance.now() of beat 0. */
export type DanceState = { routine: readonly DanceMoveId[]; bpm: number; startedAt: number }

export function beatsAt(state: DanceState, now: number) {
  return ((now - state.startedAt) / 60_000) * state.bpm
}
