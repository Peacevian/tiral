# Puts Mixamo animations (FBX, "Without Skin") onto a character made by
# make_hero.py. Both skeletons use Mixamo's bone names, but rest in different
# poses (Mixamo's T-pose, MakeHuman's A-pose). Each of our bones is first
# swung to point the way Mixamo's does at rest; then each bone's turn away
# from rest is copied in world space, frame by frame, and baked as keys.
#   Blender -b -P scripts/characters/retarget.py -- out/hero-game.blend anims/ out/ [preview] [video] [game]
# Clips longer than 10 seconds are cut to their first 10. "game": the file
# keeps only the clips the game plays (GAME_CLIPS); without it, all of them.
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

ARGS = sys.argv[sys.argv.index("--") + 1:]
BLEND, ANIMS, OUT = (os.path.abspath(a) for a in ARGS[:3])
PREVIEW = "preview" in ARGS
VIDEO = "video" in ARGS  # a short clip of each animation, every other frame
MAX_FRAMES = 300  # 10 s at 30 fps
# What the game plays (apps/web/src/components/NewBody.tsx, and the street
# crowd standing about and sitting: components/city/StreetCrowd.tsx).
GAME_CLIPS = {
    "breathing_idle", "walking", "running", "victory", "texting_while_standing", "hit_reaction", "defeated", "waving",
    "sitting_idle", "sitting_talking", "sad_idle",
}
GAME = "game" in ARGS

bpy.ops.wm.open_mainfile(filepath=BLEND)
scene = bpy.context.scene
target = next(o for o in scene.objects if o.type == "ARMATURE")


def depth(bone):
    n = 0
    while bone.parent:
        bone, n = bone.parent, n + 1
    return n


def rest_world(arm, name):
    return arm.matrix_world @ arm.data.bones[name].matrix_local


def rotation(matrix):
    return matrix.to_3x3().normalized().to_quaternion()


def direction(arm, name):
    return (rest_world(arm, name).to_3x3().normalized() @ Vector((0, 1, 0))).normalized()


def retarget(fbx):
    before = set(bpy.data.objects)
    actions_before = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=fbx)
    imported = [o for o in bpy.data.objects if o not in before]
    # Mixamo's own clip comes in with the FBX; it goes after (it would be
    # exported too: it drives bones of the same names).
    source_actions = [a for a in bpy.data.actions if a not in actions_before]
    source = next(o for o in imported if o.type == "ARMATURE")
    clip = os.path.splitext(os.path.basename(fbx))[0].lower().replace(" ", "_")
    start, end = (int(f) for f in source.animation_data.action.frame_range)
    end = min(end, start + MAX_FRAMES - 1)

    names = sorted((b.name for b in target.data.bones if b.name in source.data.bones), key=lambda n: depth(target.data.bones[n]))
    # World rotation of each bone at rest, in both skeletons.
    src_rest = {n: rotation(rest_world(source, n)) for n in names}
    # Ours, swung to point along Mixamo's rest direction.
    tgt_rest = {n: direction(target, n).rotation_difference(direction(source, n)) @ rotation(rest_world(target, n)) for n in names}
    # Hips height, to scale the body's up/down and sideways movement.
    hips = "mixamorig:Hips"
    scale = rest_world(target, hips).translation.z / max(rest_world(source, hips).translation.z, 1e-6)
    src_hips0 = (source.matrix_world @ source.data.bones[hips].matrix_local).translation.copy()

    action = bpy.data.actions.new(clip)
    target.animation_data_create()
    target.animation_data.action = action
    for pb in target.pose.bones:
        pb.rotation_mode = "QUATERNION"
        pb.matrix_basis = Matrix.Identity(4)

    for frame in range(start, end + 1):
        scene.frame_set(frame)
        for n in names:
            src_pose = rotation(source.matrix_world @ source.pose.bones[n].matrix)
            world = src_pose @ src_rest[n].inverted() @ tgt_rest[n]
            pb = target.pose.bones[n]
            head = (target.matrix_world @ pb.matrix).translation
            if n == hips:
                moved = (source.matrix_world @ source.pose.bones[n].matrix).translation - src_hips0
                head = rest_world(target, hips).translation + moved * scale
            m = Matrix.Translation(head) @ world.to_matrix().to_4x4()
            pb.matrix = target.matrix_world.inverted() @ m
            bpy.context.view_layer.update()
            pb.keyframe_insert("rotation_quaternion", frame=frame - start)
            if n == hips:
                pb.keyframe_insert("location", frame=frame - start)
    for o in imported:
        bpy.data.objects.remove(o, do_unlink=True)
    for a in source_actions:
        bpy.data.actions.remove(a)
    action.use_fake_user = True
    print("CLIP", clip, end - start + 1, "frames")
    return action, end - start


clips = [retarget(os.path.join(ANIMS, f)) for f in sorted(os.listdir(ANIMS)) if f.lower().endswith(".fbx")]

if PREVIEW or VIDEO:
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = 512, 768
    scene.world = bpy.data.worlds.new("World")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.82, 0.81, 0.78, 1)
    bpy.ops.object.light_add(type="SUN", rotation=(math.radians(50), 0, math.radians(30)))
    bpy.ops.object.camera_add(location=(2.2, -5.2, 1.0), rotation=(math.radians(90), 0, math.radians(23)))
    scene.camera = bpy.context.object
    scene.camera.data.lens = 60
for action, length in clips if PREVIEW else []:
    target.animation_data.action = action
    for i, f in enumerate((0, length // 3, 2 * length // 3)):
        scene.frame_set(f)
        scene.render.filepath = os.path.join(OUT, f"anim-{action.name}-{i}.png")
        bpy.ops.render.render(write_still=True)
if VIDEO:
    scene.render.resolution_x, scene.render.resolution_y = 384, 576
    for action, length in clips:
        target.animation_data.action = action
        folder = os.path.join(OUT, f"video-{action.name}")
        os.makedirs(folder, exist_ok=True)
        for f in range(0, min(length, 120) + 1, 2):
            scene.frame_set(f)
            scene.render.filepath = os.path.join(folder, f"{f // 2:04d}.png")
            bpy.ops.render.render(write_still=True)

# The clips on the character, as one file for the game.
for obj in [o for o in scene.objects if o.type in ("CAMERA", "LIGHT")]:
    bpy.data.objects.remove(obj, do_unlink=True)
for action in list(bpy.data.actions):
    if GAME and action.name not in GAME_CLIPS:
        bpy.data.actions.remove(action)
print("EXPORT", sorted(a.name for a in bpy.data.actions))
NAME = os.path.splitext(os.path.basename(BLEND))[0]
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, f"{NAME}-anims.glb"), export_format="GLB", export_skins=True, export_animations=True, export_animation_mode="ACTIONS")
print("DONE")
