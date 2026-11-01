"""同一基準姿勢へ適用する共通ローカル回転。平行移動は骨長比で換算。"""
import math
import bpy
from common import ROOT, read


def build(arm, c):
    definition = read(ROOT / 'animations/humanoid_chibi.json')
    fps = definition['fps']
    bpy.context.scene.render.fps = fps
    height = arm.data.bones['Head'].tail_local.z
    result = []
    for name, options in c['animations'].items():
        if name not in definition['clips']:
            raise ValueError(f'未対応アニメーション: {name}')
        spec = dict(definition['clips'][name], **options)
        if spec['duration'] <= 0 or spec.get('speed', 1) <= 0:
            raise ValueError('duration と speed は正数')
        end = max(3, round(spec['duration'] / spec.get('speed', 1)*fps)+1)
        action = bpy.data.actions.new(name)
        action.use_fake_user = True
        arm.animation_data_create()
        arm.animation_data.action = action
        for frame in range(1, end+1):
            t = (frame-1)/(end-1)
            phase = t*2*math.pi
            wave = math.sin(phase)
            envelope = math.sin(math.pi*t)**2
            amp = spec['amplitude']
            for bone in arm.pose.bones:
                bone.rotation_mode = 'XYZ'
                bone.rotation_euler = (0,0,0)
                bone.location = (0,0,0)
                bone.scale = (1,1,1)
            if name == 'Idle':
                arm.pose.bones['Spine'].rotation_euler.x = .025*wave*amp
                arm.pose.bones['Head'].rotation_euler.z = .035*wave*amp
                arm.pose.bones['Hips'].location.y = .006*height*wave*amp
            elif name == 'Walk':
                arm.pose.bones['Hips'].location.y = .012*height*(1-math.cos(2*phase))*amp
                for s, sign in [('L',1),('R',-1)]:
                    arm.pose.bones['Thigh.'+s].rotation_euler.x = .32*wave*sign*amp
                    arm.pose.bones['Shin.'+s].rotation_euler.x = -.25*max(0, wave*sign)*amp
                    arm.pose.bones['UpperArm.'+s].rotation_euler.x = -.24*wave*sign*amp
            else:
                jump = envelope*(.07 if name == 'Happy' else .045)*height*amp
                arm.pose.bones['Hips'].location.y = jump
                arm.pose.bones['Spine'].rotation_euler.x = (-.13 if name == 'Surprise' else .08)*envelope*amp
                arm.pose.bones['Head'].rotation_euler.x = -.12*envelope*amp
                for s, sign in [('L',1),('R',-1)]:
                    arm.pose.bones['UpperArm.'+s].rotation_euler.z = -.45*sign*envelope*amp
                    arm.pose.bones['Forearm.'+s].rotation_euler.x = -.25*envelope*amp
            for bone in arm.pose.bones:
                bone.keyframe_insert('rotation_euler', frame=frame, group=bone.name)
                bone.keyframe_insert('location', frame=frame, group=bone.name)
        action['loop'] = spec['loop']
        action['fps'] = fps
        result.append((action, end))
        arm.animation_data.action = None
    for action, end in result:
        track = arm.animation_data.nla_tracks.new()
        track.name = action.name
        track.strips.new(action.name, 1, action)
        track.mute = True
    reset(arm)
    return result


def reset(arm):
    if arm.animation_data:
        arm.animation_data.action = None
    for bone in arm.pose.bones:
        bone.location = (0,0,0)
        bone.rotation_euler = (0,0,0)
        bone.scale = (1,1,1)
    bpy.context.view_layer.update()
