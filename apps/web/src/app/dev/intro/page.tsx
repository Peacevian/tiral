"use client"

import { Suspense, useEffect, useMemo, useRef } from "react"
import { notFound } from "next/navigation"
import { Canvas, useThree } from "@react-three/fiber"
import { useTexture } from "@react-three/drei"
import * as THREE from "three"
import type { AvatarLoadout } from "@tiral/avatars"
import { RealisticAvatar } from "@/components/RealisticAvatar"
import type { DanceFrame, Vec } from "@/lib/dance/moves"

// The intro video's scene 1, "Leaving home" (marketing/intro): a little
// village home on a cloud over Kampala. Mum hands her son 10K, "Go and make it
// in Kampala!", he can't believe it's only 10K, she gives him a loving nudge
// off the cloud and he falls towards the city, ending on the exact view scene
// 2 opens on. Development only; recorded frame by frame: window.film.frame(t).

const DURATION = 4.5

// Kampala below: the view scene 2 opens on (zoom 14.45 from straight above,
// 1080×1920), as a picture 3,777 × 6,714 m. A 45° camera this high above it
// sees exactly that frame.
const MAP_W = 3777
const MAP_H = 6714
const FOV = 45
const FINAL_HEIGHT = MAP_H / 2 / Math.tan(((FOV / 2) * Math.PI) / 180)
const CAMERA_END_Y = -400
const GROUND_Y = CAMERA_END_Y - FINAL_HEIGHT

const SON: AvatarLoadout = { skin: "#6B4423", shirt: "#F8FAFC", pants: "#27364d", hat: "none", hatColor: "#92400e", backpack: "#C8102E", shoes: "#26211c", glasses: "none", hair: "fade", hairColor: "#1c1410", outfit: "shirt", trail: "none" }
const MUM: AvatarLoadout = { skin: "#5A3A22", shirt: "#B91C7A", pants: "#27364d", hat: "headwrap", hatColor: "#F59E0B", backpack: "#92400e", shoes: "#26211c", glasses: "none", hair: "short", hairColor: "#1c1410", outfit: "gomesi", trail: "none" }

// Where things stand (metres; the cloud's top is y = 0, the edge at x ≈ 4.2).
const MUM_AT: Vec = [2.9, 0, 1.0]
const SON_AT: Vec = [4.0, 0, 1.0]
const EDGE_X = 5.6

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const at = (t: number, start: number, length: number) => clamp((t - start) / length)
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const lerp = (a: number, b: number, u: number) => a + (b - a) * u
const lerpV = (a: Vec, b: Vec, u: number): Vec => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)]

// ---------------------------------------------------------------------------
// Poses (the dance system's frames: model space, +Z forward, X outward).

const STAND: DanceFrame = {
  torso: [0, 1, 0.02],
  head: [0, 1, 0.08],
  armL: { upper: [0.18, -1, 0], lower: [0.06, -1, 0.12] },
  armR: { upper: [0.18, -1, 0], lower: [0.06, -1, 0.12] },
  legL: { upper: [0.06, -1, 0], lower: [0.02, -1, -0.02] },
  legR: { upper: [0.06, -1, 0], lower: [0.02, -1, -0.02] },
  hipsYaw: 0,
  hipsRoll: 0,
  yaw: 0,
  shiftX: 0,
  lift: 0
}

function mix(a: DanceFrame, b: DanceFrame, u: number): DanceFrame {
  const limb = (x: DanceFrame["armL"], y: DanceFrame["armL"]) => ({ upper: lerpV(x.upper, y.upper, u), lower: lerpV(x.lower, y.lower, u) })
  return {
    torso: lerpV(a.torso, b.torso, u),
    head: lerpV(a.head, b.head, u),
    armL: limb(a.armL, b.armL),
    armR: limb(a.armR, b.armR),
    legL: limb(a.legL, b.legL),
    legR: limb(a.legR, b.legR),
    hipsYaw: lerp(a.hipsYaw, b.hipsYaw, u),
    hipsRoll: lerp(a.hipsRoll, b.hipsRoll, u),
    yaw: lerp(a.yaw, b.yaw, u),
    shiftX: lerp(a.shiftX, b.shiftX, u),
    lift: lerp(a.lift, b.lift, u)
  }
}

// Mum: holding out the note (right hand), then a two-handed nudge, then waving.
const MUM_GIVE: DanceFrame = { ...STAND, armR: { upper: [0.08, -0.45, 1], lower: [0, -0.05, 1] }, head: [0, 1, 0.12] }
const MUM_PUSH: DanceFrame = { ...STAND, torso: [0, 1, 0.25], armL: { upper: [0.05, -0.15, 1], lower: [-0.1, 0.05, 1] }, armR: { upper: [0.05, -0.15, 1], lower: [-0.1, 0.05, 1] } }
const mumWave = (t: number): DanceFrame => ({ ...STAND, head: [0, 0.95, 0.3], armR: { upper: [0.55, 0.85, 0.1], lower: [0.15 + 0.35 * Math.sin(t * 14), 1, 0.1] } })

// Son: taking the note (left hand), "just 10K??" shrug, then falling.
const SON_TAKE: DanceFrame = { ...STAND, armL: { upper: [0.1, -0.4, 1], lower: [0, 0.1, 1] }, head: [0, 0.9, 0.35] }
const SON_SHRUG: DanceFrame = {
  ...STAND,
  head: [0.18, 1, 0.1],
  hipsRoll: 0.05,
  armL: { upper: [0.45, -0.85, 0.2], lower: [0.75, 0.35, 0.55] },
  armR: { upper: [0.45, -0.85, 0.2], lower: [0.75, 0.35, 0.55] }
}
const sonFall = (t: number): DanceFrame => {
  const w = Math.sin(t * 13)
  const v = Math.sin(t * 11 + 1)
  return {
    ...STAND,
    torso: [0, 1, -0.15],
    head: [0, 1, -0.3],
    armL: { upper: [0.9, 0.55 + 0.25 * w, 0.1], lower: [0.3, 1, 0.2 * v] },
    armR: { upper: [0.9, 0.55 - 0.25 * w, 0.1], lower: [0.3, 1, -0.2 * v] },
    legL: { upper: [0.25, -0.75, 0.45 + 0.3 * v], lower: [0.1, -1, -0.5] },
    legR: { upper: [0.25, -0.75, 0.45 - 0.3 * v], lower: [0.1, -1, -0.5] }
  }
}

// ---------------------------------------------------------------------------
// The story as a function of time.

type State = {
  mum: { pose: DanceFrame; yaw: number; step: number }
  son: { pose: DanceFrame; yaw: number; position: Vec; tumble: number }
  camera: { position: Vec; target: Vec; up: Vec }
}

function sonFallPosition(t: number): Vec {
  const f = Math.max(0, t - 2.05)
  // Off the edge, then dropping ever faster (a cartoon fall, not physics).
  return [SON_AT[0] + Math.min(2.8, f * 3.2), -(6 * f * f + 900 * Math.pow(f / 2.4, 3)), SON_AT[2]]
}

function story(t: number): State {
  // Mum: gives (0.2–1.4), back to standing, push (1.75–2.0), waves after.
  let mumPose = mix(STAND, MUM_GIVE, ease(at(t, 0.15, 0.3)))
  mumPose = mix(mumPose, STAND, ease(at(t, 1.2, 0.3)))
  mumPose = mix(mumPose, MUM_PUSH, ease(at(t, 1.72, 0.18)))
  mumPose = mix(mumPose, mumWave(t), ease(at(t, 2.05, 0.25)))
  // Son: takes (0.35), shrugs at the camera (1.3), nudged off (1.9), falls.
  let sonPose = mix(STAND, SON_TAKE, ease(at(t, 0.35, 0.3)))
  sonPose = mix(sonPose, SON_SHRUG, ease(at(t, 1.25, 0.2)))
  sonPose = mix(sonPose, sonFall(t), ease(at(t, 1.95, 0.25)))
  const sonYaw = lerp(-Math.PI / 2, -0.25, ease(at(t, 1.2, 0.25)))
  const position = sonFallPosition(t)
  const tumble = -Math.min(1.1, Math.max(0, t - 1.92) * 2.2)

  // Camera: a medium shot of the two on the cloud with a slow push in; it
  // swings over the edge after him, follows him down a little above, then
  // lets him drop away and settles on the view scene 2 opens on.
  const shot = lerpV([3.5, 1.45, 6.6], [3.55, 1.5, 5.9], ease(at(t, 0, 2.0)))
  const shotTarget: Vec = [3.45, 1.15, 1.0]
  const over: Vec = [EDGE_X + 1.6, 3.2, SON_AT[2] + 3.0]
  const end: Vec = [EDGE_X + 1.6, CAMERA_END_Y, SON_AT[2]]
  const sonTarget: Vec = [position[0], position[1] + 0.9, position[2]]
  let camera: Vec = shot
  let target: Vec = shotTarget
  if (t > 1.95) {
    const u = ease(at(t, 1.95, 0.45))
    camera = lerpV(shot, over, u)
    target = lerpV(shotTarget, sonTarget, u)
  }
  if (t > 2.4) {
    // Following: just above him at first, then he pulls away.
    const f = t - 2.4
    const follow: Vec = [lerp(over[0], end[0], ease(at(t, 2.4, 1.6))), Math.min(over[1], position[1] + 3.4 + 40 * f * f), lerp(over[2], end[2], ease(at(t, 2.4, 1.6)))]
    camera = lerpV(follow, end, ease(at(t, 3.5, 1.0)))
    target = lerpV(sonTarget, [end[0], GROUND_Y, end[2]], ease(at(t, 2.6, 1.6)))
  }
  const up: Vec = lerpV([0, 1, 0], [0, 0, -1], ease(at(t, 2.6, 1.6)))
  return {
    // She steps up to him for the nudge, and back to wave.
    mum: { pose: mumPose, yaw: Math.PI / 2, step: 0.45 * ease(at(t, 1.6, 0.25)) * (1 - 0.6 * ease(at(t, 2.2, 0.4))) },
    son: { pose: sonPose, yaw: sonYaw, position, tumble },
    camera: { position: camera, target, up }
  }
}

// ---------------------------------------------------------------------------
// The set: a cloud island with a village home, Kampala far below.

function Cloud() {
  const puffs = useMemo(() => {
    const out: Array<{ p: Vec; r: number }> = []
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2
      const r = 3.1 + ((i * 37) % 7) / 8
      out.push({ p: [Math.cos(a) * r + 1.0, -0.9 - ((i * 13) % 5) / 8, Math.sin(a) * r * 0.8 - 0.8], r: 1.0 + ((i * 7) % 5) / 8 })
    }
    for (let i = 0; i < 12; i++) out.push({ p: [((i * 53) % 7) - 2.2, -1.2, ((i * 31) % 6) - 3.6], r: 1.6 })
    for (let i = 0; i < 10; i++) out.push({ p: [((i * 41) % 6) - 1.6, -2.3 - (i % 3) * 0.5, ((i * 23) % 5) - 3.0], r: 1.4 })
    return out
  }, [])
  return (
    <group>
      {/* The flat top they stand on. */}
      <mesh position={[1.0, -0.25, -0.8]} scale={[4.2, 0.5, 3.3]}>
        <sphereGeometry args={[1, 32, 16]} />
        <meshStandardMaterial color="#ffffff" roughness={1} />
      </mesh>
      {puffs.map((puff, i) => (
        <mesh key={i} position={puff.p}>
          <sphereGeometry args={[puff.r, 20, 14]} />
          <meshStandardMaterial color={i % 3 ? "#ffffff" : "#EEF3FA"} roughness={1} />
        </mesh>
      ))}
    </group>
  )
}

function Home() {
  return (
    <group position={[0.4, 0, -2.0]} rotation={[0, 0.3, 0]}>
      {/* Plastered walls, a steel door and a barred window. */}
      <mesh position={[0, 1.15, 0]}>
        <boxGeometry args={[3.2, 2.3, 2.4]} />
        <meshStandardMaterial color="#EBD9B8" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.15, 0]}>
        <boxGeometry args={[3.24, 0.3, 2.44]} />
        <meshStandardMaterial color="#B5652E" roughness={0.9} />
      </mesh>
      <mesh position={[0.6, 0.95, 1.205]}>
        <boxGeometry args={[0.8, 1.7, 0.03]} />
        <meshStandardMaterial color="#2F7D4A" roughness={0.6} />
      </mesh>
      <mesh position={[-0.75, 1.35, 1.205]}>
        <boxGeometry args={[0.8, 0.65, 0.03]} />
        <meshStandardMaterial color="#33424C" roughness={0.5} />
      </mesh>
      {/* Iron-sheet roof. */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[0, 2.62, side * 0.62]} rotation={[side * 0.42, 0, 0]}>
          <boxGeometry args={[3.6, 0.06, 1.45]} />
          <meshStandardMaterial color="#9A5A3C" roughness={0.6} metalness={0.3} />
        </mesh>
      ))}
      {/* A banana plant by the door. */}
      <group position={[2.0, 0, 0.9]}>
        <mesh position={[0, 0.7, 0]}>
          <cylinderGeometry args={[0.09, 0.12, 1.4, 8]} />
          <meshStandardMaterial color="#6E8B3D" />
        </mesh>
        {[0, 1.25, 2.5, 3.75, 5].map((a) => (
          <mesh key={a} position={[Math.cos(a) * 0.45, 1.45, Math.sin(a) * 0.45]} rotation={[Math.sin(a) * 0.6, a, Math.cos(a) * 0.6]} scale={[0.7, 0.08, 0.22]}>
            <sphereGeometry args={[1, 12, 8]} />
            <meshStandardMaterial color="#4F8A2B" />
          </mesh>
        ))}
      </group>
    </group>
  )
}

function Kampala() {
  const texture = useTexture("/dev/intro-kampala-v1.png")
  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 8
  }, [texture])
  return (
    <mesh position={[EDGE_X + 1.6, GROUND_Y, SON_AT[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[MAP_W, MAP_H]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  )
}

/** A 10K note fluttering after him as he falls (placed by the Director). */
function Note() {
  return (
    <group name="note" visible={false}>
      <mesh>
        <planeGeometry args={[0.32, 0.16]} />
        <meshStandardMaterial color="#5FA36A" side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0, 0.002]}>
        <planeGeometry args={[0.14, 0.09]} />
        <meshStandardMaterial color="#E8F4D8" side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

// ---------------------------------------------------------------------------

function Director({ onReady }: { onReady(frame: (t: number) => Promise<void>): void }) {
  const { camera, advance, scene } = useThree()
  const mumPose = useRef<DanceFrame | null>(STAND)
  const sonPose = useRef<DanceFrame | null>(STAND)
  const mum = useRef<THREE.Group>(null)
  const son = useRef<THREE.Group>(null)
  const sonTumble = useRef<THREE.Group>(null)

  useEffect(() => {
    const perspective = camera as THREE.PerspectiveCamera
    perspective.fov = FOV
    perspective.near = 0.05
    perspective.far = 20000
    perspective.updateProjectionMatrix()
    let clock = 0
    onReady(async (t: number) => {
      const s = story(t)
      mumPose.current = s.mum.pose
      sonPose.current = s.son.pose
      mum.current?.rotation.set(0, s.mum.yaw, 0)
      mum.current?.position.set(MUM_AT[0] + s.mum.step, MUM_AT[1], MUM_AT[2])
      if (son.current) {
        son.current.position.set(...s.son.position)
        son.current.rotation.set(0, s.son.yaw, 0)
      }
      sonTumble.current?.rotation.set(0, 0, s.son.tumble)
      const note = scene.getObjectByName("note")
      if (note) {
        const f = Math.max(0, t - 2.0)
        note.visible = t > 2.0
        note.position.set(s.son.position[0] - 0.4 - f * 0.6, s.son.position[1] + 1.4 + f * 1.8, s.son.position[2] + 0.5)
        note.rotation.set(t * 7, t * 5, t * 3)
      }
      camera.position.set(...s.camera.position)
      camera.up.set(...s.camera.up)
      camera.lookAt(...s.camera.target)
      camera.updateMatrixWorld()
      clock += 1000 / 30
      advance(clock)
      // Screen positions of the heads, for the speech bubbles.
      const head = (group: THREE.Group | null, height: number) => {
        if (!group) return null
        const p = new THREE.Vector3(0, height, 0).applyMatrix4(group.matrixWorld).project(camera)
        return { x: (p.x * 0.5 + 0.5) * window.innerWidth, y: (-p.y * 0.5 + 0.5) * window.innerHeight }
      }
      updateOverlay(t, head(mum.current, 1.95), head(son.current, 1.9))
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    })
  }, [camera, advance, scene, onReady])

  return (
    <>
      <hemisphereLight args={["#FFFFFF", "#9BB7D4", 1.6]} />
      <directionalLight position={[6, 10, 8]} intensity={2.2} />
      <Cloud />
      <Home />
      <group ref={mum} position={MUM_AT}>
        <RealisticAvatar loadout={MUM} moving={false} posed={mumPose} noBackpack />
      </group>
      <group ref={son} position={SON_AT}>
        <group ref={sonTumble}>
          <RealisticAvatar loadout={SON} moving={false} posed={sonPose} />
        </group>
      </group>
      <Note />
      <Kampala />
    </>
  )
}

// ---------------------------------------------------------------------------
// Words on screen: speech bubbles at the heads, then the caption and bills.

const BILLS = [
  { icon: "🏠", title: "Rent due Friday", amount: "150,000", t: 2.8, x: 60, y: 1180 },
  { icon: "📱", title: "Cousin: \"send me 20K\"", amount: "20,000", t: 3.1, x: 300, y: 1380 },
  { icon: "🎒", title: "Sister's school fees", amount: "200,000", t: 3.4, x: 90, y: 1580 }
]

function updateOverlay(t: number, mumHead: { x: number; y: number } | null, sonHead: { x: number; y: number } | null) {
  const bubble = (id: string, head: { x: number; y: number } | null, start: number, end: number, side: "left" | "right") => {
    const el = document.getElementById(id)
    if (!el || !head) return
    const u = at(t, start, 0.18)
    const out = at(t, end, 0.15)
    el.style.opacity = String(u * (1 - out))
    const w = el.offsetWidth
    const x = side === "left" ? head.x - w + 120 : head.x - 120
    el.style.transform = `translate(${Math.max(30, Math.min(1050 - w, x))}px, ${head.y - el.offsetHeight - 40}px) scale(${lerp(0.6, 1, Math.min(1, u * 1.3))})`
  }
  bubble("b-mum", mumHead, 0.2, 1.3, "left")
  bubble("b-son", sonHead, 1.3, 1.9, "right")
  bubble("b-tugende", mumHead, 1.95, 2.6, "left")
  const caption = document.getElementById("caption")
  if (caption) {
    const u = at(t, 2.6, 0.22)
    caption.style.opacity = String(u)
    caption.style.transform = `scale(${lerp(1.6, 1, Math.min(1, u * 1.2))})`
  }
  BILLS.forEach((bill, i) => {
    const el = document.getElementById(`bill${i}`)
    if (!el) return
    const u = at(t, bill.t, 0.22)
    el.style.opacity = String(u)
    el.style.transform = `translate(${bill.x}px, ${bill.y + lerp(-60, 0, u)}px) scale(${lerp(0.7, 1, u)}) rotate(${i % 2 ? 2 : -2}deg)`
  })
}

export default function IntroScene() {
  if (process.env.NODE_ENV === "production") notFound()
  const ready = useRef(false)
  useEffect(() => {
    const fonts = document.createElement("link")
    fonts.rel = "stylesheet"
    fonts.href = "https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@500;900&family=Permanent+Marker&display=block"
    document.head.append(fonts)
  }, [])
  return (
    <main style={{ position: "fixed", inset: 0, overflow: "hidden", background: "linear-gradient(180deg, #4F9BE0 0%, #8EC5F2 45%, #DCEEFB 75%, #FFF2D9 100%)" }}>
      <div style={{ position: "absolute", width: 420, height: 420, left: 640, top: 140, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,246,214,.95) 0%, rgba(255,236,170,.55) 35%, rgba(255,236,170,0) 70%)" }} />
      <Canvas gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }} frameloop="never" dpr={1} style={{ position: "absolute", inset: 0 }}>
        <Suspense fallback={null}>
          <Director
            onReady={(frame) => {
              if (ready.current) return
              ready.current = true
              Object.assign(window, { film: { DURATION, setup: () => document.fonts.ready.then(() => true), frame }, __filmReady: true })
            }}
          />
        </Suspense>
      </Canvas>
      <style>{`
        .bubble { position: absolute; left: 0; top: 0; opacity: 0; transform-origin: 50% 100%; max-width: 640px; background: #fff; color: #0E2A4D;
          border: 6px solid #0E2A4D; border-radius: 40px; padding: 22px 30px; font: 900 46px/1.15 'Inter', system-ui, sans-serif; box-shadow: 8px 8px 0 #0E2A4D; }
        .bubble small { display: block; font-size: 28px; color: #C2410C; letter-spacing: .06em; text-transform: uppercase; margin-bottom: 4px; }
        .caption { position: absolute; left: 0; right: 0; top: 190px; text-align: center; opacity: 0; font: 400 92px 'Permanent Marker', cursive; color: #F2C14E; text-shadow: 0 7px 0 #0E2A4D, 0 0 3px #0E2A4D, 0 0 22px rgba(0,0,0,.35); white-space: nowrap; }
        .bill { position: absolute; left: 0; top: 0; opacity: 0; display: flex; align-items: center; gap: 20px; background: #fff; border: 4px solid #D9E2EC; border-radius: 30px;
          padding: 18px 26px; box-shadow: 0 14px 34px rgba(14,42,77,.3); font-family: 'Inter', system-ui, sans-serif; }
        .bill b { font-size: 38px; color: #0E2A4D; font-weight: 900; } .bill i { font-style: normal; font-size: 54px; } .bill span { font: 900 40px ui-monospace, Menlo, monospace; color: #C8102E; }
      `}</style>
      <div className="bubble" id="b-mum"><small>Mum</small>Here&apos;s 10K. Go and make it in Kampala!</div>
      <div className="bubble" id="b-son"><small>Me</small>Just 10K?? 😳</div>
      <div className="bubble" id="b-tugende"><small>Mum</small>Tugende! 👋</div>
      {BILLS.map((bill, i) => (
        <div className="bill" id={`bill${i}`} key={i}>
          <i>{bill.icon}</i>
          <b>{bill.title}</b>
          <span>−{bill.amount}</span>
        </div>
      ))}
      <div className="caption" id="caption">Welcome to Kampala.</div>
    </main>
  )
}
