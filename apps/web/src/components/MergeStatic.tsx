"use client"

import { useLayoutEffect, useRef, type ReactNode } from "react"
import * as THREE from "three"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"

// Models built from many small primitives (the boda is ~60) cost one draw call
// per mesh, for every copy on the map. MergeStatic keeps the JSX as the source
// of truth but draws it as one mesh per look-alike material: the children are
// built as usual, then baked into merged geometry and hidden.
//
// Only plain, opaque, untextured MeshStandardMaterial meshes are merged; the
// rest (canvas textures, glows, see-through parts) are left as they are.
// Anything that moves on its own must stay outside (or get its own MergeStatic
// inside the moving group).

/** One material per look, shared by every merged model on the page. */
const sharedMaterials = new Map<string, THREE.MeshStandardMaterial>()

function mergeKey(material: THREE.Material): string | null {
  const standard = material as THREE.MeshStandardMaterial
  if (!standard.isMeshStandardMaterial || standard.type !== "MeshStandardMaterial") return null
  if (standard.map || standard.transparent || standard.alphaTest > 0) return null
  return [
    standard.color.getHexString(),
    standard.emissive.getHexString(),
    standard.emissiveIntensity,
    standard.metalness,
    standard.roughness,
    standard.side,
    standard.flatShading
  ].join("|")
}

export function MergeStatic({ version, children }: { version: string | number; children: ReactNode }) {
  const source = useRef<THREE.Group>(null)
  const merged = useRef<THREE.Group>(null)

  // Re-bake whenever the parts change (`version`), before the frame is drawn.
  useLayoutEffect(() => {
    const from = source.current
    const into = merged.current
    if (!from || !into) return
    from.updateWorldMatrix(true, true)
    const toLocal = from.matrixWorld.clone().invert()
    const batches = new Map<
      string,
      { material: THREE.Material; geometries: THREE.BufferGeometry[]; sources: THREE.Mesh[]; castShadow: boolean; receiveShadow: boolean }
    >()

    from.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (!mesh.isMesh || Array.isArray(mesh.material) || !mesh.visible) return
      const key = mergeKey(mesh.material)
      if (!key) return
      const geometry = mesh.geometry.index ? mesh.geometry.clone() : null
      if (!geometry) return
      geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toLocal, mesh.matrixWorld))
      for (const name of Object.keys(geometry.attributes)) if (!["position", "normal", "uv"].includes(name)) geometry.deleteAttribute(name)
      let batch = batches.get(key)
      if (!batch) {
        let material = sharedMaterials.get(key)
        if (!material) {
          material = (mesh.material as THREE.MeshStandardMaterial).clone()
          sharedMaterials.set(key, material)
        }
        batch = { material, geometries: [], sources: [], castShadow: false, receiveShadow: false }
        batches.set(key, batch)
      }
      batch.geometries.push(geometry)
      batch.castShadow ||= mesh.castShadow
      batch.receiveShadow ||= mesh.receiveShadow
      batch.sources.push(mesh)
    })

    const created: THREE.Mesh[] = []
    const baked: THREE.Mesh[] = []
    for (const batch of batches.values()) {
      const geometry = batch.geometries.length === 1 ? batch.geometries[0] : mergeGeometries(batch.geometries, false)
      if (batch.geometries.length > 1) for (const part of batch.geometries) part.dispose()
      if (!geometry) continue
      const mesh = new THREE.Mesh(geometry, batch.material)
      mesh.castShadow = batch.castShadow
      mesh.receiveShadow = batch.receiveShadow
      created.push(mesh)
      into.add(mesh)
      baked.push(...batch.sources)
    }
    // Hide the originals that were baked (the rest still draw themselves).
    for (const mesh of baked) mesh.visible = false

    return () => {
      for (const mesh of created) {
        into.remove(mesh)
        mesh.geometry.dispose()
      }
      for (const mesh of baked) mesh.visible = true
    }
  }, [version])

  return (
    <>
      <group ref={source}>{children}</group>
      <group ref={merged} />
    </>
  )
}
