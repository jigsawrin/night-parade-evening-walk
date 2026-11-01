"""GLB、FBX、編集用BLENDと確認画像。"""
from pathlib import Path
import bpy
from mathutils import Vector
from motion import reset
from quality import materials, mesh_report, skin_report


def select(meshes, arm):
    bpy.ops.object.select_all(action='DESELECT')
    for o in [*meshes, arm]:
        o.select_set(True)
    bpy.context.view_layer.objects.active = arm


def fbx(path, animated=False):
    bpy.ops.export_scene.fbx(filepath=str(path), use_selection=True, object_types={'MESH','ARMATURE'},
        add_leaf_bones=False, use_armature_deform_only=False, axis_forward='-Z', axis_up='Y',
        path_mode='COPY', embed_textures=True, bake_anim=animated, bake_anim_use_all_actions=False,
        bake_anim_use_nla_strips=False, bake_anim_simplify_factor=0, bake_anim_step=1)


def export(c, run, meshes, arm, actions):
    dest = Path(c['output_path']) / c['id'] / run.name
    for folder in ('web','roblox','blend','previews'):
        (dest / folder).mkdir(parents=True)
    reset(arm)
    select(meshes, arm)
    glb = dest / 'web' / (c['id']+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format='GLB', use_selection=True,
        export_animations=True, export_animation_mode='ACTIONS', export_nla_strips=True,
        export_force_sampling=True, export_def_bones=False, export_yup=True)
    model = dest / 'roblox' / (c['id']+'.fbx')
    fbx(model)
    clips = []
    scene_name = bpy.context.scene.name
    for action,end in actions:
        arm.animation_data.action = action
        bpy.context.scene.name = action.name
        bpy.context.scene.frame_start, bpy.context.scene.frame_end = 1,end
        clip = dest / 'roblox' / (c['id']+'_'+action.name+'.fbx')
        fbx(clip, animated=True)
        clips.append((clip, action.name))
    bpy.context.scene.name = scene_name
    reset(arm)
    bpy.context.scene.frame_set(1)
    blend = dest / 'blend' / (c['id']+'.blend')
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    previews = render(dest / 'previews', meshes, arm) if c.get('previews') else []
    return glb, model, blend, clips, previews


def render(dest, meshes, arm):
    scene = bpy.context.scene
    # ヘッドレス/制限環境でもGPUコンテキストを要求しない。
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 16
    scene.render.resolution_x, scene.render.resolution_y = 640,640
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.world.color = (.18,.18,.18)
    height = max(v.co.z for o in meshes for v in o.data.vertices)
    light = bpy.data.objects.new('PreviewLight', bpy.data.lights.new('PreviewLight','AREA'))
    scene.collection.objects.link(light)
    light.location = (2*height,-3*height,4*height)
    light.data.energy = 450
    light.data.shape = 'DISK'
    light.data.size = 4*height
    light.rotation_euler = (Vector((0,0,height*.5))-light.location).to_track_quat('-Z','Y').to_euler()
    camera = bpy.data.objects.new('PreviewCamera', bpy.data.cameras.new('PreviewCamera'))
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 1.35*height
    out = []
    for name,xyz in [('front',(0,-3,.65)),('back',(0,3,.65)),('side',(3,0,.65))]:
        camera.location = Vector(xyz)*height
        camera.rotation_euler = (Vector((0,0,height*.5))-camera.location).to_track_quat('-Z','Y').to_euler()
        light.location = camera.location + Vector((-.7,0,1.5))*height
        light.rotation_euler = (Vector((0,0,height*.5))-light.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath = str(dest / (name+'.png'))
        bpy.ops.render.render(write_still=True)
        out.append(Path(scene.render.filepath))
    return out


def reload_check(path, expected_bones, expected_clips):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if path.suffix == '.glb':
        bpy.ops.import_scene.gltf(filepath=str(path))
    elif path.suffix == '.fbx':
        bpy.ops.import_scene.fbx(filepath=str(path))
    else:
        bpy.ops.wm.open_mainfile(filepath=str(path))
    arms = [o for o in bpy.context.scene.objects if o.type == 'ARMATURE']
    # glTF importerが骨表示用に生成するカスタムシェイプは製品メッシュではない。
    shapes = {b.custom_shape for arm in arms for b in arm.pose.bones if b.custom_shape}
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o not in shapes]
    if len(arms) != 1 or not meshes:
        raise ValueError(f'再読込の骨格/メッシュ欠落: {path}')
    skin = skin_report(meshes, arms[0])
    if skin['bones'] != expected_bones:
        raise ValueError(f'再読込の骨名/階層不一致: {path}: {skin["bones"]}')
    if any(skin[k] for k in ('unassigned','over_four','root_weights','unnormalized')):
        raise ValueError(f'再読込ウェイト異常: {skin}')
    actions = [dict(name=a.name, start=a.frame_range[0], end=a.frame_range[1]) for a in bpy.data.actions]
    for name in expected_clips:
        if not any(name in a['name'] and a['end']>a['start'] for a in actions):
            raise ValueError(f'再読込クリップ欠落: {path}: {name}: {actions}')
    return dict(file=str(path), skin=skin, materials=materials(meshes), meshes=mesh_report(meshes), actions=actions)
