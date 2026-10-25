# Builds a playable character (the hero, a young man, or the heroine, a young
# woman) as a rigged model with MPFB (MakeHuman for Blender), all from code,
# and renders previews. Run headless:
#   /Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/characters/make_hero.py -- out/ [game] [heroine]
# "game": the low-poly body and small, flattened textures (the clothes become
# plain colours), for the browser. Without it: the full-detail MakeHuman look.
# Needs the MPFB extension and the MakeHuman system assets (CC0).
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from bl_ext.blender_org.mpfb.services.humanservice import HumanService
from bl_ext.blender_org.mpfb.services.locationservice import LocationService

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = os.path.abspath(ARGS[0] if ARGS else "out")
GAME = "game" in ARGS
WHO = "heroine" if "heroine" in ARGS else "hero"
NAME = f"{WHO}-game" if GAME else WHO
os.makedirs(OUT, exist_ok=True)
DATA = LocationService.get_user_data()

# MakeHuman's age slider: 0.1875 is 11 years old, 0.5 is 25. Its faces read
# older than the slider says, so 0.31 (17 on paper) looks about 19-20.
CHARACTERS = {
    # Young Ugandan man, about 19, slim and fit, shaved head.
    "hero": {
        "macro": {"gender": 1.0, "age": 0.31, "muscle": 0.55, "weight": 0.4, "proportions": 0.6, "height": 0.55, "cupsize": 0.5, "firmness": 0.5},
        "skin": "young_african_male",
        "proxy": "male_generic",
        "assets": [
            ("Eyes", "eyes/low-poly/low-poly.mhclo"),
            ("Eyebrows", "eyebrows/eyebrow001/eyebrow001.mhclo"),
            ("Eyelashes", "eyelashes/eyelashes01/eyelashes01.mhclo"),
            ("Clothes", "clothes/male_casualsuit06/male_casualsuit06.mhclo"),
            ("Clothes", "clothes/shoes04/shoes04.mhclo"),
        ],
        "top": (0.94, 0.95, 0.96),  # white shirt
        "bottom": (0.153, 0.212, 0.302),  # navy trousers, #27364d
    },
    # Young Ugandan woman, about 19, slim, short natural hair.
    "heroine": {
        "macro": {"gender": 0.0, "age": 0.31, "muscle": 0.5, "weight": 0.45, "proportions": 0.6, "height": 0.45, "cupsize": 0.45, "firmness": 0.6},
        "skin": "young_african_female",
        "proxy": "female_generic",
        "assets": [
            ("Eyes", "eyes/low-poly/low-poly.mhclo"),
            ("Eyebrows", "eyebrows/eyebrow002/eyebrow002.mhclo"),
            ("Eyelashes", "eyelashes/eyelashes01/eyelashes01.mhclo"),
            ("Hair", "hair/afro01/afro01.mhclo"),
            ("Clothes", "clothes/female_casualsuit01/female_casualsuit01.mhclo"),
            ("Clothes", "clothes/shoes05/shoes05.mhclo"),
        ],
        "top": (0.93, 0.66, 0.12),  # mustard top
        "bottom": (0.18, 0.24, 0.36),  # dark jeans
    },
}
CHAR = CHARACTERS[WHO]
MACRO = {**CHAR["macro"], "race": {"african": 1.0, "asian": 0.0, "caucasian": 0.0}}
SKIN = os.path.join(DATA, f"skins/{CHAR['skin']}/{CHAR['skin']}.mhmat")
ASSETS = CHAR["assets"]
TOP, BOTTOM = np.array(CHAR["top"]), np.array(CHAR["bottom"])
# Share of triangles kept in the game version, per mesh (by name).
KEEP = {"_generic": 0.22, "casualsuit": 0.45, "shoes": 0.3, "afro": 0.5}


def legs_mask(cloth, w, h):
    """Which texels of the outfit's texture are the trousers: the faces of
    every piece of the mesh that reaches down to the ankles, drawn in UV
    space (a few texels wider, so the seams don't bleed the top's colour)."""
    bm = bmesh.new()
    bm.from_mesh(cloth.data)
    uv = bm.loops.layers.uv.active
    mask = np.zeros((h, w), bool)
    ys, xs = np.mgrid[0:h, 0:w] + 0.5
    seen = set()
    for face in bm.faces:
        if face in seen:
            continue
        part, stack = set(), [face]
        while stack:
            f = stack.pop()
            if f not in part:
                part.add(f)
                stack.extend(g for e in f.edges for g in e.link_faces)
        seen |= part
        if min(v.co.z for f in part for v in f.verts) > 0.4:
            continue
        for f in part:
            pts = [(l[uv].uv.x * w, l[uv].uv.y * h) for l in f.loops]
            for (ax, ay), (bx, by), (cx, cy) in ((pts[0], pts[i], pts[i + 1]) for i in range(1, len(pts) - 1)):
                x0, x1 = int(max(min(ax, bx, cx), 0)), int(min(max(ax, bx, cx) + 1, w))
                y0, y1 = int(max(min(ay, by, cy), 0)), int(min(max(ay, by, cy) + 1, h))
                X, Y = xs[y0:y1, x0:x1], ys[y0:y1, x0:x1]
                d1 = (X - bx) * (ay - by) - (ax - bx) * (Y - by)
                d2 = (X - cx) * (by - cy) - (bx - cx) * (Y - cy)
                d3 = (X - ax) * (cy - ay) - (cx - ax) * (Y - ay)
                neg, pos = (d1 < 0) | (d2 < 0) | (d3 < 0), (d1 > 0) | (d2 > 0) | (d3 > 0)
                mask[y0:y1, x0:x1] |= ~(neg & pos)
    bm.free()
    for _ in range(3):
        mask = mask | np.roll(mask, 1, 0) | np.roll(mask, -1, 0) | np.roll(mask, 1, 1) | np.roll(mask, -1, 1)
    return mask


def paint(image, legs=None):
    """Flatten a photo texture towards a painted look: less grain. On the
    clothes (given which texels are the trousers), the trousers and the top
    each become one plain colour (logos go), keeping only the folds' shading."""
    w, h = image.size
    px = np.array(image.pixels[:], dtype=np.float32).reshape(h, w, 4)
    rgb = px[..., :3]
    if legs is not None:
        shade = rgb.mean(axis=2)
        for part in (legs, ~legs):
            # Logos, trims and stitching (far from the part's usual colour)
            # take its average shade, so only the folds remain.
            odd = part & (np.abs(rgb - np.median(rgb[part], axis=0)).sum(axis=2) > 0.2)
            shade[odd] = shade[part & ~odd].mean()
        bottom = BOTTOM * (shade / shade[legs].mean()).clip(0.6, 1.3)[..., None]
        top = TOP * (shade / shade[~legs].mean()).clip(0.7, 1.08)[..., None]
        rgb = np.where(legs[..., None], bottom, top)
    # Box blur (3 passes of a 5-tap average) to melt the photo grain.
    for _ in range(3):
        rgb = sum(np.roll(rgb, d, axis=a) for a in (0, 1) for d in (-2, -1, 0, 1, 2)) / 10
    px[..., :3] = rgb
    image.pixels[:] = px.ravel()
    image.update()


for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)

body = HumanService.create_human(macro_detail_dict=MACRO)
body.name = WHO.capitalize()
HumanService.add_builtin_rig(body, "mixamo")
if GAME:
    HumanService.add_mhclo_asset(os.path.join(DATA, f"proxymeshes/{CHAR['proxy']}/{CHAR['proxy']}.proxy"), body, asset_type="Proxymeshes", subdiv_levels=0, material_type="NONE")
HumanService.set_character_skin(SKIN, body, skin_type="MAKESKIN")
for kind, path in ASSETS:
    HumanService.add_mhclo_asset(os.path.join(DATA, path), body, asset_type=kind, subdiv_levels=0, material_type="MAKESKIN")
if GAME:
    # The proxy carries the skin now; the full-detail body goes.
    bpy.data.objects.remove(body, do_unlink=True)
    for image in [i for i in bpy.data.images if i.source == "FILE"]:
        if image.size[0] > 512:
            image.scale(512, 512)
    cloth = next(o for o in bpy.data.objects if "casualsuit" in o.name)
    for node in [n for n in cloth.active_material.node_tree.nodes if n.type == "NORMAL_MAP"]:
        # The outfit's bump map carries its logo; plain cloth needs none.
        cloth.active_material.node_tree.nodes.remove(node)
    for image in [i for i in bpy.data.images if i.source == "FILE" and i.size[0]]:
        if "casualsuit" in image.name and "diffuse" in image.name:
            paint(image, legs_mask(cloth, *image.size))
        elif "skin" in image.name or "male" in image.name:
            paint(image)

# MakeHuman gives every material an alpha channel, which exports as blended
# (see-through): the far arm showed through the head. Skin, clothes, shoes
# and eyes become solid; brows, lashes and hair are cut out (alpha rounded
# to 0 or 1, which the glTF exporter writes as a mask).
CUT_OUT = ("eyebrow", "eyelash", "afro", "hair")
for material in bpy.data.materials:
    tree = material.node_tree
    bsdf = next((n for n in tree.nodes if n.type == "BSDF_PRINCIPLED"), None) if tree else None
    if not bsdf:
        continue
    alpha = bsdf.inputs["Alpha"]
    source = alpha.links[0].from_socket if alpha.links else None
    for link in list(alpha.links):
        tree.links.remove(link)
    alpha.default_value = 1.0
    if source and any(part in material.name.lower() for part in CUT_OUT):
        clip = tree.nodes.new("ShaderNodeMath")
        clip.operation = "ROUND"
        tree.links.new(source, clip.inputs[0])
        tree.links.new(clip.outputs[0], alpha)

rig = next(o for o in bpy.data.objects if o.type == "ARMATURE")
tris = 0
for obj in bpy.data.objects:
    if obj.type == "MESH":
        # Bake in the masks (the body hidden under the clothes is cut away) and,
        # for the game, thin the mesh out. Both go before the armature.
        bpy.context.view_layer.objects.active = obj
        if GAME:
            keep = next((k for part, k in KEEP.items() if part in obj.name), None)
            if keep:
                obj.modifiers.new("Decimate", "DECIMATE").ratio = keep
        for m in [m for m in obj.modifiers if m.type in ("MASK", "DECIMATE")]:
            bpy.ops.object.modifier_move_to_index(modifier=m.name, index=0)
            bpy.ops.object.modifier_apply(modifier=m.name)
        n = sum(len(p.vertices) - 2 for p in obj.data.polygons)
        tris += n
        print("MESH", obj.name, n)
print("TRIANGLES", tris)

# Previews with the arms relaxed at his sides (the exported file keeps the A-pose).
for side in ("Left", "Right"):
    bone = rig.pose.bones[f"mixamorig:{side}Arm"]
    bone.rotation_mode = "XYZ"
    bone.rotation_euler = (0, 0, math.radians(-38 if side == "Left" else 38))
bpy.context.view_layer.update()

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x, scene.render.resolution_y = 768, 1152
scene.world = bpy.data.worlds.new("World")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.82, 0.81, 0.78, 1)
bpy.ops.object.light_add(type="SUN", rotation=(math.radians(50), 0, math.radians(30)))
bpy.context.object.data.energy = 3.0
bpy.ops.object.camera_add()
cam = bpy.context.object
cam.data.lens = 70
scene.camera = cam
for view, angle in [("front", 0), ("three-quarter", 35), ("side", 90)]:
    a = math.radians(angle)
    cam.location = (6.0 * math.sin(a), -6.0 * math.cos(a), 1.0)
    cam.rotation_euler = (math.radians(90), 0, a)
    scene.render.filepath = os.path.join(OUT, f"{NAME}-{view}.png")
    bpy.ops.render.render(write_still=True)
# Face close-up, at the head's height (the heroine is shorter).
eyes = (rig.matrix_world @ rig.pose.bones["mixamorig:Head"].head).z + 0.08
cam.location = (0.55, -1.5, eyes)
cam.rotation_euler = (math.radians(90), 0, math.radians(20))
scene.render.filepath = os.path.join(OUT, f"{NAME}-face.png")
bpy.ops.render.render(write_still=True)

for bone in rig.pose.bones:
    bone.rotation_euler = (0, 0, 0)
for obj in [o for o in bpy.data.objects if o.type in ("CAMERA", "LIGHT")]:
    bpy.data.objects.remove(obj, do_unlink=True)
# Keep the edited textures in the .blend (they differ from the files on disk).
for image in bpy.data.images:
    if image.source == "FILE" and image.has_data:
        image.pack()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, f"{NAME}.blend"))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, f"{NAME}.glb"), export_format="GLB", export_skins=True, export_animations=False)
print("DONE", OUT)
