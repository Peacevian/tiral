# 3D model credits

| File | Model | Author | License | Source |
|---|---|---|---|---|
| `runner-v2.glb` | Casual Character | Quaternius | CC0 1.0 (public domain) | https://poly.pizza/m/kZ3DmIoGip |

Used as the rigged player avatar (`apps/web/src/components/RealisticAvatar.tsx`).
Materials are recoloured and outfit details painted at runtime. The file is
optimised from the original with gltf-transform: only the 9 animation clips the
game plays are kept (Death, HitRecieve, HitRecieve_2, Idle, Idle_Neutral,
Interact, Run, Walk, Wave), unused data pruned, and normals, UVs and skin
weights quantized (KHR_mesh_quantization; 321 KB → 290 KB gzipped). Positions
stay float (skinned meshes ignore the node transform that position quantization
relies on: the body blows up ~100×), and there is no resample/dedup (they shifted
the riding pose's arms). Skeleton leaf nodes (`*_end`)
are kept: the riding pose and foot attachment use them. Bump the version in the
file name whenever it changes (it is cached for a year).

| File | Model | Author | License | Source |
|---|---|---|---|---|
| `young-man-v5.glb`, `young-woman-v5.glb` | Made by `scripts/characters/make_hero.py` | MakeHuman / MPFB assets | CC0 1.0 (system assets) | https://static.makehumancommunity.org/assets/assetdownload.html |
| (their animations) | Mixamo clips | Adobe | Mixamo terms: free in games, not to be shared as standalone files | https://www.mixamo.com |

The new realistic characters (`apps/web/src/components/NewBody.tsx`): bodies,
clothes and hair from MakeHuman's CC0 assets, rigged with Mixamo's skeleton,
textures turned to light grey shading (the game tints them with each player's colours) and meshes thinned to ~8.5k triangles; then
`scripts/characters/retarget.py` bakes the game's 8 Mixamo clips onto each, and
gltf-transform `optimize --compress meshopt --texture-compress webp --texture-size 512`.
