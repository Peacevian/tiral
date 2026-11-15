# Builds a playable character (the hero, a young man, or the heroine, a young
# woman) as a rigged model with MPFB (MakeHuman for Blender), all from code,
# and renders previews. Run headless:
#   /Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/characters/make_hero.py -- out/ [game|crowd] [heroine]
# "game": the low-poly body and small, flattened textures (the clothes become
# plain colours), for the browser. Without it: the full-detail MakeHuman look.
# "crowd": the street crowd's body, for people too small on screen to need
# more: a fifth of the triangles, tiny textures, no eyes or brows, and the
# fingers and toes folded into the hands and feet (20 bones, not 52).
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
CROWD = "crowd" in ARGS
GAME = "game" in ARGS or CROWD
WHO = "heroine" if "heroine" in ARGS else "hero"
NAME = f"{WHO}-crowd" if CROWD else f"{WHO}-game" if GAME else WHO
os.makedirs(OUT, exist_ok=True)
DATA = LocationService.get_user_data()

# MakeHuman's age slider: 0.1875 is 11 years old, 0.5 is 25. Its faces read
# older than the slider says, so 0.31 (17 on paper) looks about 19-20.
CHARACTERS = {
    # Young Ugandan man, about 19, slim and fit. Both hair styles are in the
    # file (short, afro); the game shows the player's, or none (bald).
    "hero": {
        "macro": {"gender": 1.0, "age": 0.31, "muscle": 0.55, "weight": 0.4, "proportions": 0.6, "height": 0.55, "cupsize": 0.5, "firmness": 0.5},
        "skin": "young_african_male",
        "proxy": "male_generic",
        "assets": [
            ("Eyes", "eyes/low-poly/low-poly.mhclo"),
            ("Eyebrows", "eyebrows/eyebrow001/eyebrow001.mhclo"),
            ("Eyelashes", "eyelashes/eyelashes01/eyelashes01.mhclo"),
            ("Hair", "hair/short02/short02.mhclo"),
            ("Hair", "hair/afro01/afro01.mhclo"),
            ("Clothes", "clothes/male_casualsuit06/male_casualsuit06.mhclo"),
            ("Clothes", "clothes/shoes04/shoes04.mhclo"),
        ],
    },
    # Young Ugandan woman, about 19, slim; hair as for the man.
    "heroine": {
        "macro": {"gender": 0.0, "age": 0.31, "muscle": 0.5, "weight": 0.45, "proportions": 0.6, "height": 0.45, "cupsize": 0.45, "firmness": 0.6},
        "skin": "young_african_female",
        "proxy": "female_generic",
        "assets": [
            ("Eyes", "eyes/low-poly/low-poly.mhclo"),
            ("Eyebrows", "eyebrows/eyebrow002/eyebrow002.mhclo"),
            ("Eyelashes", "eyelashes/eyelashes01/eyelashes01.mhclo"),
            ("Hair", "hair/short02/short02.mhclo"),
            ("Hair", "hair/afro01/afro01.mhclo"),
            ("Clothes", "clothes/female_casualsuit01/female_casualsuit01.mhclo"),
            ("Clothes", "clothes/shoes05/shoes05.mhclo"),
        ],
    },
}
CHAR = CHARACTERS[WHO]
MACRO = {**CHAR["macro"], "race": {"african": 1.0, "asian": 0.0, "caucasian": 0.0}}
SKIN = os.path.join(DATA, f"skins/{CHAR['skin']}/{CHAR['skin']}.mhmat")
ASSETS = CHAR["assets"]
if CROWD:
    # Too small on screen for a face: no eyes, brows or lashes.
    ASSETS = [(kind, path) for kind, path in ASSETS if kind not in ("Eyes", "Eyebrows", "Eyelashes")]
# Share of triangles kept in the game version, per mesh (by name).
KEEP = {"_generic": 0.22, "casualsuit": 0.45, "shoes": 0.3, "afro": 0.5, "short02": 0.5}
if CROWD:
    KEEP = {"_generic": 0.06, "casualsuit": 0.13, "shoes": 0.1, "afro": 0.2, "short02": 0.17}
# Textures are light grey shading only; the largest side kept (px).
TEXTURE = 128 if CROWD else 512

# Bones the crowd body drops (their weights go to the hand or foot).
FOLD = {}
for _side in ("Left", "Right"):
    for _finger in ("Index", "Middle", "Pinky", "Ring", "Thumb"):
        for _joint in (1, 2, 3):
            FOLD[f"mixamorig:{_side}Hand{_finger}{_joint}"] = f"mixamorig:{_side}Hand"
    FOLD[f"mixamorig:{_side}ToeBase"] = f"mixamorig:{_side}Foot"


def fold_bones(rig, meshes):
    """Move each folded bone's weights to the bone it folds into, then delete it."""
    for obj in meshes:
        groups = obj.vertex_groups
        for src, dst in FOLD.items():
            if src not in groups:
                continue
            if dst not in groups:
                groups.new(name=dst)
            source, target = groups[src].index, groups[dst]
            for vertex in obj.data.vertices:
                weight = next((g.weight for g in vertex.groups if g.group == source), 0.0)
                if weight > 0:
                    target.add([vertex.index], weight, "ADD")
            groups.remove(groups[src])
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for name in FOLD:
        bone = rig.data.edit_bones.get(name)
        if bone:
            rig.data.edit_bones.remove(bone)
    bpy.ops.object.mode_set(mode="OBJECT")


# Which part of the figure a face is, as the grey it's painted: the game reads
# it back and paints the part this person's colour (see CrowdBody.tsx).
REGION_CODES = {"top": 0.2, "bottom": 0.4, "body": 0.6, "shoes": 0.8, "hair": 1.0}


def flatten_for_crowd():
    """Each mesh gets one plain material, and a vertex colour per face corner
    naming the part it is; then the body, clothes and shoes are joined into one
    mesh. The result is three meshes (body, short hair, afro) drawn with one
    shared material, so a person costs one or two draw calls, not eight."""
    plain = bpy.data.materials.new("crowd")
    plain.use_nodes = True
    bsdf = next(n for n in plain.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (1, 1, 1, 1)
    bsdf.inputs["Roughness"].default_value = 0.85
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    for obj in meshes:
        mesh = obj.data
        names = [m.name if m else "" for m in mesh.materials]
        for old in list(mesh.color_attributes):
            mesh.color_attributes.remove(old)
        colours = mesh.color_attributes.new(name="Region", type="FLOAT_COLOR", domain="CORNER")
        for poly in mesh.polygons:
            name = names[poly.material_index] if names else ""
            code = next((c for part, c in REGION_CODES.items() if f".{part}" in name), REGION_CODES["body"])
            for loop in poly.loop_indices:
                colours.data[loop].color = (code, code, code, 1.0)
        mesh.color_attributes.active_color = colours
        mesh.color_attributes.render_color_index = list(mesh.color_attributes).index(colours)
        mesh.materials.clear()
        mesh.materials.append(plain)
        for poly in mesh.polygons:
            poly.material_index = 0
    joined = [o for o in meshes if any(part in o.name for part in ("casualsuit", "_generic", "shoes"))]
    cloth = next(o for o in joined if "casualsuit" in o.name)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in joined:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = cloth
    bpy.ops.object.join()
    cloth.name = f"{WHO}.crowd"
    print("MESHES", sorted(o.name for o in bpy.data.objects if o.type == "MESH"))


def legs_faces(cloth):
    """The trousers: the faces of every piece of the outfit's mesh that
    reaches down to the ankles (the top and its sleeves stop at the hips)."""
    bm = bmesh.new()
    bm.from_mesh(cloth.data)
    legs, seen = set(), set()
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
        if min(v.co.z for f in part for v in f.verts) < 0.4:
            legs |= {f.index for f in part}
    bm.free()
    return legs


def legs_mask(cloth, faces, w, h):
    """Which texels of the outfit's texture the trousers use: their faces
    drawn in UV space (a few texels wider, so the seams don't bleed)."""
    uv = cloth.data.uv_layers.active.data
    mask = np.zeros((h, w), bool)
    ys, xs = np.mgrid[0:h, 0:w] + 0.5
    for poly in (cloth.data.polygons[i] for i in faces):
        pts = [(uv[i].uv.x * w, uv[i].uv.y * h) for i in poly.loop_indices]
        for (ax, ay), (bx, by), (cx, cy) in ((pts[0], pts[i], pts[i + 1]) for i in range(1, len(pts) - 1)):
            x0, x1 = int(max(min(ax, bx, cx), 0)), int(min(max(ax, bx, cx) + 1, w))
            y0, y1 = int(max(min(ay, by, cy), 0)), int(min(max(ay, by, cy) + 1, h))
            X, Y = xs[y0:y1, x0:x1], ys[y0:y1, x0:x1]
            d1 = (X - bx) * (ay - by) - (ax - bx) * (Y - by)
            d2 = (X - cx) * (by - cy) - (bx - cx) * (Y - cy)
            d3 = (X - ax) * (cy - ay) - (cx - ax) * (Y - ay)
            neg, pos = (d1 < 0) | (d2 < 0) | (d3 < 0), (d1 > 0) | (d2 > 0) | (d3 > 0)
            mask[y0:y1, x0:x1] |= ~(neg & pos)
    for _ in range(3):
        mask = mask | np.roll(mask, 1, 0) | np.roll(mask, -1, 0) | np.roll(mask, 1, 1) | np.roll(mask, -1, 1)
    return mask


# The game tints the textures with each player's colours (multiplying them),
# so they're made light grey with only their shading left, averaging this.
GREY = 0.92


def paint(image, parts=None, floor=0.5):
    """Turn a photo texture into a light grey shading map for tinting, with
    less grain. `parts`: masks of texels to even out separately (the top and
    the trousers), where logos, trims and stitching (far from the part's usual
    colour) take its average shade, so only the folds remain. `floor`: the
    darkest the shading goes (skin keeps more: lips, eyes)."""
    w, h = image.size
    px = np.array(image.pixels[:], dtype=np.float32).reshape(h, w, 4)
    rgb = px[..., :3]
    shade = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    grey = np.ones_like(shade)
    for part in parts or [np.ones((h, w), bool)]:
        odd = part & (np.abs(rgb - np.median(rgb[part], axis=0)).sum(axis=2) > 0.2) if parts else np.zeros_like(part)
        shade[odd] = shade[part & ~odd].mean()
        grey[part] = (GREY * shade[part] / shade[part].mean()).clip(floor, 1.0)
    rgb = np.repeat(grey[..., None], 3, axis=2)
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
        if image.size[0] > TEXTURE:
            image.scale(TEXTURE, TEXTURE)
    cloth = next(o for o in bpy.data.objects if "casualsuit" in o.name)
    for node in [n for n in cloth.active_material.node_tree.nodes if n.type == "NORMAL_MAP"]:
        # The outfit's bump map carries its logo; plain cloth needs none.
        cloth.active_material.node_tree.nodes.remove(node)
    # The top and the trousers become two materials, tinted apart.
    legs = legs_faces(cloth)
    top = cloth.active_material
    top.name = f"{WHO}.top"
    bottom = top.copy()
    bottom.name = f"{WHO}.bottom"
    # Denim is duller than a cotton top; this also keeps the two materials
    # different, or gltf-transform would merge them (and their colours).
    next(n for n in bottom.node_tree.nodes if n.type == "BSDF_PRINCIPLED").inputs["Roughness"].default_value = 0.85
    cloth.data.materials.append(bottom)
    for poly in cloth.data.polygons:
        poly.material_index = 1 if poly.index in legs else 0
    for image in [i for i in bpy.data.images if i.source == "FILE" and i.size[0] and "normal" not in i.name]:
        if "casualsuit" in image.name:
            mask = legs_mask(cloth, legs, *image.size)
            paint(image, [mask, ~mask])
        elif "skin" in image.name or "male" in image.name:
            paint(image, floor=0.35)
        elif any(part in image.name for part in ("shoes", "afro", "short02")):
            paint(image, floor=0.2)
    # Named for what the game tints.
    for obj in bpy.data.objects:
        # Both hair styles are in the file; the game shows the player's.
        for role, part in (("body", CHAR["proxy"]), ("shoes", "shoes"), ("hair-afro", "afro01"), ("hair-short", "short02")):
            if obj.type == "MESH" and part in obj.name and obj.active_material:
                obj.active_material.name = f"{WHO}.{role}"

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
if CROWD:
    fold_bones(rig, [o for o in bpy.data.objects if o.type == "MESH"])
    print("BONES", len(rig.data.bones))
    flatten_for_crowd()

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
if CROWD:
    scene.render.resolution_x, scene.render.resolution_y = 256, 384
for view, angle in [("front", 0)] if CROWD else [("front", 0), ("three-quarter", 35), ("side", 90)]:
    a = math.radians(angle)
    cam.location = (6.0 * math.sin(a), -6.0 * math.cos(a), 1.0)
    cam.rotation_euler = (math.radians(90), 0, a)
    scene.render.filepath = os.path.join(OUT, f"{NAME}-{view}.png")
    bpy.ops.render.render(write_still=True)
if not CROWD:
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
