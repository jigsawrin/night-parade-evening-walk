"""共通骨格の配置と最大4影響のウェイト。"""
import math
import bpy
from mathutils import Vector
from common import ROOT, read


def create(meshes, c, warnings):
    definition = read(ROOT / 'rigs/humanoid_chibi.json')
    points = [v.co for o in meshes for v in o.data.vertices]
    height = max(p.z for p in points)
    width = max(p.x for p in points) - min(p.x for p in points)
    depth = max(p.y for p in points) - min(p.y for p in points)
    warnings.append('骨位置は外形寸法と基準比率から推定。正面・関節・甲羅領域を目視確認してください')
    arm = bpy.data.objects.new('YokaiRig', bpy.data.armatures.new('humanoid_chibi'))
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    overrides = c.get('bone_overrides', {})
    unknown = set(overrides) - {b['name'] for b in definition['bones']}
    if unknown:
        raise ValueError(f'不明な骨補正: {unknown}')
    for spec in definition['bones']:
        bone = arm.data.edit_bones.new(spec['name'])
        values = dict(spec, **overrides.get(spec['name'], {}))
        for attr in ('head', 'tail'):
            xyz = values[attr]
            setattr(bone, attr, Vector((xyz[0]*width, xyz[1]*depth, xyz[2]*height)))
        if (bone.tail - bone.head).length < 1e-6:
            raise ValueError(f'長さゼロの骨: {bone.name}')
        if spec.get('parent'):
            bone.parent = arm.data.edit_bones[spec['parent']]
        bone.use_deform = spec['name'] != 'Root'
        # X軸を可能な限りモデル前後方向に合わせ、左右で安定させる。
        bone.align_roll(Vector((0, 1, 0)))
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


def distance(p, a, b):
    v = b-a
    t = max(0, min(1, (p-a).dot(v) / max(v.length_squared, 1e-12)))
    return (p-(a+t*v)).length


def bind(meshes, arm, c, warnings):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes:
        obj.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    method = c.get('weight_method', 'auto')
    if method not in ('auto', 'distance'):
        raise ValueError('weight_method は auto または distance')
    if method == 'auto':
        try:
            bpy.ops.object.parent_set(type='ARMATURE_AUTO')
        except RuntimeError as exc:
            warnings.append(f'自動ウェイト失敗、距離方式へ: {exc}')
    deform = [b for b in arm.data.bones if b.use_deform]
    height = max(v.co.z for o in meshes for v in o.data.vertices)
    fallback = 0
    for obj in meshes:
        obj.parent = arm
        if not any(m.type == 'ARMATURE' for m in obj.modifiers):
            obj.modifiers.new('YokaiSkin', 'ARMATURE').object = arm
        for group in list(obj.vertex_groups):
            if group.name not in {b.name for b in deform}:
                obj.vertex_groups.remove(group)
        for b in deform:
            if not obj.vertex_groups.get(b.name):
                obj.vertex_groups.new(name=b.name)
        names = {g.index: g.name for g in obj.vertex_groups}
        regions = c.get('rigid_regions', [])
        for region in regions:
            if region['bone'] not in {b.name for b in deform}:
                raise ValueError(f"領域の骨が不正: {region['bone']}")
        for v in obj.data.vertices:
            weights = [(names[g.group], g.weight) for g in v.groups if g.weight > 1e-8 and g.group in names]
            if method == 'distance' or not weights:
                fallback += 1
                weights = [(b.name, 1/max(distance(v.co, b.head_local, b.tail_local), .015*height)**4) for b in deform]
            # 大頭のシルエットを保つ。境界は首周辺で自動ウェイトを残す。
            if v.co.z > arm.data.bones['Head'].head_local.z + .05*height:
                weights = [('Head', 1)]
            for region in regions:
                if region.get('object') and region['object'] != obj.name:
                    continue
                lo, hi = region.get('min', [-1e6]*3), region.get('max', [1e6]*3)
                if all(lo[i] <= v.co[i]/height <= hi[i] for i in range(3)):
                    feather = region.get('feather', 0)
                    if feather > 0:
                        edge = min(min(v.co[i]/height-lo[i],hi[i]-v.co[i]/height) for i in range(3))
                        blend = min(1, edge/feather)
                        total = sum(w for _,w in weights)
                        mixed = {name: w/total*(1-blend) for name,w in weights}
                        mixed[region['bone']] = mixed.get(region['bone'],0)+blend
                        weights = list(mixed.items())
                    else:
                        weights = [(region['bone'], 1)]
            weights = sorted(weights, key=lambda x: -x[1])[:4]
            total = sum(w for _, w in weights)
            for group in obj.vertex_groups:
                group.remove([v.index])
            for name, w in weights:
                obj.vertex_groups[name].add([v.index], w/total, 'REPLACE')
    if fallback:
        warnings.append(f'距離ベース代替ウェイト適用: {fallback}頂点。関節の目視調整が必要')
    return {'method': method, 'fallback_vertices': fallback}
