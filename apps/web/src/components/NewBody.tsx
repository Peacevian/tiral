"use client"

import { useEffect, useMemo } from "react"
import { useFrame } from "@react-three/fiber"
import { useGLTF } from "@react-three/drei"
import * as THREE from "three"
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js"
import { resolveLoadout, type AvatarLoadout, type Body } from "@tiral/avatars"
import { newBodiesOn } from "@/lib/newBodies"
import type { AvatarAct, AvatarPose } from "./RealisticAvatar"

// The realistic young man and woman, made from code (scripts/characters),
// with Mixamo's animations baked in. Drawn by RealisticAvatar instead of the
// old model when the switch is on (lib/newBodies). Same size as life, feet at
// y=0, facing +Z like the old model. Clothes keep their own colours for now.
// Versioned names: served with a one-year immutable cache (next.config.ts).

export const BODY_MODELS: Record<Body, string> = {
  male: "/models/young-man-v2.glb",
  female: "/models/young-woman-v2.glb"
}

const CLIPS = {
  idle: "breathing_idle",
  walk: "walking",
  run: "running",
  dance: "victory"
} as const

const ACT_CLIPS: Record<AvatarAct, string> = {
  calm: "breathing_idle",
  phone: "texting_while_standing",
  flinch: "hit_reaction",
  shock: "hit_reaction",
  collapse: "defeated",
  run: "running",
  wave: "waving"
}
// Beats that play once and hold their last pose.
const ONE_SHOT_ACTS: ReadonlySet<AvatarAct> = new Set(["flinch", "shock", "collapse"])

export function NewBody({
  loadout,
  moving,
  pose = "auto",
  gait = "walk",
  act
}: {
  loadout: AvatarLoadout
  moving: boolean
  pose?: AvatarPose
  gait?: "walk" | "run"
  act?: AvatarAct
}) {
  const { scene, animations } = useGLTF(BODY_MODELS[resolveLoadout(loadout).body])
  const model = useMemo(() => {
    const copy = clone(scene)
    copy.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) {
        object.castShadow = true
        // Skinned meshes' bounds are their rest pose: a raised arm or a
        // crouch would be culled at the screen's edge.
        object.frustumCulled = false
      }
    })
    return copy
  }, [scene])
  // Our own mixer, made with the model: drei's useAnimations keeps actions
  // bound to the first model it saw, so a new copy (another body, or a hot
  // reload) stood frozen in its rest pose while an unseen one ran.
  const mixer = useMemo(() => new THREE.AnimationMixer(model), [model])
  useEffect(() => () => mixer.stopAllAction(), [mixer])
  useFrame((_, delta) => mixer.update(delta))

  const clip = act ? ACT_CLIPS[act] : pose === "dance" ? CLIPS.dance : moving ? CLIPS[gait] : CLIPS.idle
  useEffect(() => {
    const found = THREE.AnimationClip.findByName(animations, clip)
    if (!found) return
    const action = mixer.clipAction(found)
    const once = !!act && ONE_SHOT_ACTS.has(act)
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity)
    action.clampWhenFinished = once
    action.reset().fadeIn(0.25).play()
    return () => {
      action.fadeOut(0.25)
    }
  }, [mixer, animations, clip, act])

  return <primitive object={model} />
}

if (newBodiesOn()) for (const url of Object.values(BODY_MODELS)) useGLTF.preload(url)
