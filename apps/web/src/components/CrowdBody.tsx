"use client"

import { useEffect, useLayoutEffect, useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import { useGLTF } from "@react-three/drei"
import * as THREE from "three"
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js"
import { resolveLoadout, type AvatarLoadout, type Body } from "@tiral/avatars"

// The street crowd's body (scripts/characters make_hero.py crowd): the young
// man and woman, built for people a few pixels tall. About 2.7k triangles, 20
// bones, no face, and no add-ons (no hats, glasses, backpacks or outfit extras).
// The whole figure is one mesh with one plain material (plus one more mesh for
// its hair), so a person costs one or two draw calls, not eight. Each vertex
// carries a grey that says which part it is (0.2 top, 0.4 trousers, 0.6 skin,
// 0.8 shoes, 1.0 hair); the shader paints the part from a five-colour palette
// that belongs to this person. Same size and facing as NewBody.
// Versioned names: served with a one-year immutable cache (next.config.ts).

const MODELS: Record<Body, { url: string; scale: number }> = {
  male: { url: "/models/crowd-man-v2.glb", scale: 1.075 },
  female: { url: "/models/crowd-woman-v2.glb", scale: 1.14 }
}

/** The clips in the files that stand in for "walking" and "standing". */
const CLIPS = { walk: "walking", idle: "breathing_idle" } as const

/** Palette slots, in the order of the part codes (code 0.2 is slot 0, and so on). */
const PARTS = 5

/**
 * One person's material: vertex colours say which part, this person's palette
 * says what colour it is. Programs are shared (same cache key); only the
 * palette differs per material.
 */
function crowdMaterial() {
  const palette = Array.from({ length: PARTS }, () => new THREE.Color())
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPalette = { value: palette }
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform vec3 uPalette[${PARTS}];`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
#ifdef USE_COLOR
  diffuseColor.rgb = uPalette[clamp(int(vColor.r * ${PARTS}.0 + 0.5) - 1, 0, ${PARTS - 1})];
#endif`
      )
  }
  material.customProgramCacheKey = () => "crowd-palette"
  return { material, palette }
}

export function CrowdBody({
  loadout,
  moving,
  clip: chosen,
  phase = 0,
  timeScale = 1
}: {
  loadout: AvatarLoadout
  moving: boolean
  /** Any clip in the file by name (standing about, sitting), over walking/idling. */
  clip?: string
  /** Seconds into the clip, so a crowd does not move in unison. */
  phase?: number
  /** Animation speed (1 = as made). */
  timeScale?: number
}) {
  const resolved = resolveLoadout(loadout)
  const fit = MODELS[resolved.body]
  const { scene, animations } = useGLTF(fit.url)
  const rig = useMemo(() => {
    const model = clone(scene)
    const { material, palette } = crowdMaterial()
    const hair = new Map<string, THREE.Object3D>()
    model.traverse((object) => {
      const mesh = object as THREE.SkinnedMesh
      if (!mesh.isMesh) return
      mesh.material = material
      mesh.castShadow = false
      // Off screen costs nothing. A fixed sphere round the whole figure (feet to
      // head, arms and legs swinging, sitting) so no pose can cull it too early.
      mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.85, 0), 1.2)
      mesh.frustumCulled = true
      const style = /afro/i.test(mesh.name) ? "afro" : /short/i.test(mesh.name) ? "short" : null
      if (style) hair.set(style, mesh)
    })
    return { model, material, palette, hair }
  }, [scene])
  useEffect(() => () => rig.material.dispose(), [rig])

  const { shirt, pants, skin, shoes, hair, hairColor } = resolved
  useLayoutEffect(() => {
    // Before the first draw; a new person is a new component, so these don't change under it.
    ;[shirt, pants, skin, shoes, hairColor].forEach((colour, i) => rig.palette[i]!.set(colour))
    // The player's hair, when the body has it (afro or short; none shows bald).
    for (const [style, mesh] of rig.hair) mesh.visible = style === hair
  }, [rig, shirt, pants, skin, shoes, hair, hairColor])

  const mixer = useMemo(() => new THREE.AnimationMixer(rig.model), [rig])
  useEffect(() => () => void mixer.stopAllAction(), [mixer])
  // Crowd figures are a few pixels tall: step them 30 times a second at most.
  const pending = useRef(0)
  useFrame((_, delta) => {
    pending.current += delta
    if (pending.current < 1 / 30) return
    mixer.update(pending.current)
    pending.current = 0
  })
  useEffect(() => {
    mixer.timeScale = timeScale
  }, [mixer, timeScale])

  const clip = chosen ?? (moving ? CLIPS.walk : CLIPS.idle)
  useEffect(() => {
    const found = THREE.AnimationClip.findByName(animations, clip)
    if (!found) return
    const action = mixer.clipAction(found)
    action.setLoop(THREE.LoopRepeat, Infinity)
    action.reset()
    action.time = phase % Math.max(found.duration, 0.001)
    action.fadeIn(0.25).play()
    return () => {
      action.fadeOut(0.25)
    }
  }, [mixer, animations, clip, phase])

  return (
    <group scale={fit.scale}>
      <primitive object={rig.model} />
    </group>
  )
}
