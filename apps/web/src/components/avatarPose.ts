import * as THREE from "three"
import type { DanceFrame, Limb, Vec } from "@/lib/dance/moves"

// Hand-made poses for the avatars, aimed bone by bone on top of a playing
// clip: seated on a boda (rider or passenger) and the dance routines (also the
// scripted intro's frames). Directions are in model space: +Z forward, +Y up,
// +X the model's left. Shared by the old model (RealisticAvatar) and the new
// bodies (NewBody); each names its bones in a Skeleton.

export type Side = "L" | "R"

/** Which bone is which. */
export type Skeleton = {
  /** The lower spine, aimed at the neck (the chest follows). */
  torso: string
  neck: string
  head: string
  /** A point above the head, to aim it by. */
  headTip: string
  /** The pelvis, turned for the dance's hip sway. */
  hips: string
  /** The bone raised or lowered to keep the feet on the floor. */
  body: string
  upperArm(side: Side): string
  lowerArm(side: Side): string
  wrist(side: Side): string
  upperLeg(side: Side): string
  lowerLeg(side: Side): string
  ankle(side: Side): string
}

export type PoseRig = {
  /** The model's root: positions and turns are taken against it. */
  root: THREE.Object3D
  bones: Map<string, THREE.Object3D>
  skeleton: Skeleton
  /** Height of the ankles at rest (the floor, for the dances). */
  legEndY: number
  bodyBind: THREE.Vector3 | null
  hipsBind: THREE.Quaternion | null
  /** Run after a pose (the old model carries its separate feet along). */
  settle?: () => void
  /** The rider's arm directions, for bodies whose arms differ from the old model's. */
  riderArms?: Arms
}

type Arms = { upper: number[]; fore: number[] }

export type RidePose = "rider" | "passenger"

type Aim = { bone: (skeleton: Skeleton) => string; toward: (skeleton: Skeleton) => string; direction: Vec }

function sideAims(side: Side, legs: { thigh: number[]; shin: number[] }, arms: Arms): Aim[] {
  const s = side === "L" ? 1 : -1
  const mirror = (v: number[]): Vec => [v[0]! * s, v[1]!, v[2]!]
  return [
    { bone: (k) => k.upperLeg(side), toward: (k) => k.lowerLeg(side), direction: mirror(legs.thigh) },
    { bone: (k) => k.lowerLeg(side), toward: (k) => k.ankle(side), direction: mirror(legs.shin) },
    { bone: (k) => k.upperArm(side), toward: (k) => k.lowerArm(side), direction: mirror(arms.upper) },
    { bone: (k) => k.lowerArm(side), toward: (k) => k.wrist(side), direction: mirror(arms.fore) }
  ]
}

const torsoAim = (direction: Vec): Aim => ({ bone: (k) => k.torso, toward: (k) => k.neck, direction })

// Leaning a little forward, thighs along the tank, feet on the pegs, hands on the bars.
const RIDER_LEGS = { thigh: [0.24, -0.3, 1], shin: [0.04, -1, -0.62] }
const RIDER_ARMS: Arms = { upper: [0.4, -0.75, 0.7], fore: [0.06, -0.2, 1] }
const riderAims = (arms: Arms): Aim[] => [torsoAim([0, 1, 0.4]), ...sideAims("L", RIDER_LEGS, arms), ...sideAims("R", RIDER_LEGS, arms)]

const RIDE_AIMS: Record<RidePose, Aim[]> = {
  rider: riderAims(RIDER_ARMS),
  // Upright on the back, knees wider, hands resting on the thighs.
  passenger: [
    torsoAim([0, 1, 0.06]),
    ...sideAims("L", { thigh: [0.32, -0.18, 1], shin: [0.1, -1, -0.5] }, { upper: [0.22, -1, 0.28], fore: [0.12, -0.55, 1] }),
    ...sideAims("R", { thigh: [0.32, -0.18, 1], shin: [0.1, -1, -0.5] }, { upper: [0.22, -1, 0.28], fore: [0.12, -0.55, 1] })
  ]
}

const scratch = {
  matrix: new THREE.Matrix4(),
  parentMatrix: new THREE.Matrix4(),
  position: new THREE.Vector3(),
  childPosition: new THREE.Vector3(),
  scale: new THREE.Vector3(),
  quaternion: new THREE.Quaternion(),
  parentQuaternion: new THREE.Quaternion(),
  delta: new THREE.Quaternion(),
  current: new THREE.Vector3(),
  target: new THREE.Vector3()
}

/**
 * An object's transform relative to the rig root, from the local transforms
 * along its parent chain (a handful of bones). Cheaper than refreshing the
 * world matrices of the whole rig and its accessories every frame, and immune
 * to whatever rotates and mirrors the model above the root.
 */
export function rootSpace(object: THREE.Object3D, root: THREE.Object3D, out: THREE.Matrix4) {
  out.identity()
  for (let node: THREE.Object3D | null = object; node && node !== root; node = node.parent) {
    node.updateMatrix()
    out.premultiply(node.matrix)
  }
  return out
}

/** Bone position/rotation relative to the rig root. */
function relative(object: THREE.Object3D, root: THREE.Object3D, position: THREE.Vector3, quaternion: THREE.Quaternion) {
  rootSpace(object, root, scratch.matrix).decompose(position, quaternion, scratch.scale)
}

/** Turn `bone` so the line to `toward` points along `direction` (model space). */
function aimBone(rig: PoseRig, boneName: string, toward: string, direction: Vec) {
  const { root, bones } = rig
  const bone = bones.get(boneName)
  const child = bones.get(toward)
  if (!bone || !child || !bone.parent) return
  relative(bone, root, scratch.position, scratch.quaternion)
  relative(child, root, scratch.childPosition, scratch.delta)
  scratch.current.subVectors(scratch.childPosition, scratch.position).normalize()
  scratch.target.set(...direction).normalize()
  scratch.delta.setFromUnitVectors(scratch.current, scratch.target)
  // New root-space rotation, expressed in the parent's frame.
  scratch.quaternion.premultiply(scratch.delta)
  relative(bone.parent, root, scratch.position, scratch.parentQuaternion)
  bone.quaternion.copy(scratch.parentQuaternion.invert().multiply(scratch.quaternion))
}

const riderCache = new WeakMap<Arms, Aim[]>()

export function applyRidePose(rig: PoseRig, pose: RidePose) {
  let aims = RIDE_AIMS[pose]
  if (pose === "rider" && rig.riderArms) {
    aims = riderCache.get(rig.riderArms) ?? riderAims(rig.riderArms)
    riderCache.set(rig.riderArms, aims)
  }
  for (const aim of aims) aimBone(rig, aim.bone(rig.skeleton), aim.toward(rig.skeleton), aim.direction)
  rig.settle?.()
}

/** Put back what a dance frame moves relative to the bind pose. */
export function resetDanceBones(rig: PoseRig) {
  if (rig.bodyBind) rig.bones.get(rig.skeleton.body)?.position.copy(rig.bodyBind)
  if (rig.hipsBind) rig.bones.get(rig.skeleton.hips)?.quaternion.copy(rig.hipsBind)
}

const danceScratch = { euler: new THREE.Euler(), turn: new THREE.Quaternion(), point: new THREE.Vector3() }

/**
 * Pose the rig for one dance frame, on top of the idle clip: turn the pelvis,
 * aim the spine, head and limbs, then raise or lower the body so the lower
 * foot stays on the floor (bent knees crouch; a hop lifts it off).
 */
export function applyDanceFrame(rig: PoseRig, frame: DanceFrame) {
  const { root, bones, skeleton: k } = rig
  resetDanceBones(rig)
  const hips = bones.get(k.hips)
  if (hips?.parent) {
    relative(hips, root, scratch.position, scratch.quaternion)
    danceScratch.turn.setFromEuler(danceScratch.euler.set(0, frame.hipsYaw, frame.hipsRoll))
    scratch.quaternion.premultiply(danceScratch.turn)
    relative(hips.parent, root, scratch.position, scratch.parentQuaternion)
    hips.quaternion.copy(scratch.parentQuaternion.invert().multiply(scratch.quaternion))
  }
  aimBone(rig, k.torso, k.neck, frame.torso)
  aimBone(rig, k.head, k.headTip, frame.head)
  // Limb directions are written outward-positive; the right side is mirrored.
  for (const side of ["L", "R"] as const) {
    const s = side === "L" ? 1 : -1
    const limb = (upper: string, lower: string, tip: string, pose: Limb) => {
      aimBone(rig, upper, lower, [pose.upper[0] * s, pose.upper[1], pose.upper[2]])
      aimBone(rig, lower, tip, [pose.lower[0] * s, pose.lower[1], pose.lower[2]])
    }
    limb(k.upperArm(side), k.lowerArm(side), k.wrist(side), side === "L" ? frame.armL : frame.armR)
    limb(k.upperLeg(side), k.lowerLeg(side), k.ankle(side), side === "L" ? frame.legL : frame.legR)
  }

  const body = bones.get(k.body)
  if (body?.parent && Number.isFinite(rig.legEndY)) {
    let lowest = Infinity
    for (const side of ["L", "R"] as const) {
      const end = bones.get(k.ankle(side))
      if (end) lowest = Math.min(lowest, danceScratch.point.setFromMatrixPosition(rootSpace(end, root, scratch.matrix)).y)
    }
    const dy = rig.legEndY - lowest + frame.lift
    danceScratch.point.setFromMatrixPosition(rootSpace(body, root, scratch.matrix))
    danceScratch.point.y += dy
    body.position.copy(danceScratch.point.applyMatrix4(rootSpace(body.parent, root, scratch.parentMatrix).invert()))
  }
  rig.settle?.()
}
