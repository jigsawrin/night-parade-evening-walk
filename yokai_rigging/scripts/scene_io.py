"""入力の読み込みと非破壊の正規化。内部座標: Z上、-Y正面。"""
from pathlib import Path
import bpy
from mathutils import Vector
from bpy_extras.io_utils import axis_conversion
from common import unpack


def load(c, run, warnings):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    source = Path(c['source_path'])
    fbx = unpack(source, run / 'source') if source.suffix.lower() == '.zip' else source
    bpy.ops.import_scene.fbx(filepath=str(fbx), use_anim=False)
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if not meshes:
        raise ValueError('FBX内にメッシュがありません')
    if any(o.type == 'ARMATURE' for o in bpy.context.scene.objects):
        raise ValueError('既存リグを含む入力は非対応。未リグモデルを指定してください')
    images = sorted(p for p in fbx.parent.rglob('*') if p.suffix.lower() in ('.jpg', '.jpeg', '.png'))
    explicit = c.get('texture')
    if explicit:
        images = [fbx.parent / explicit]
        if not images[0].is_file():
            raise FileNotFoundError(images[0])
    for obj in meshes:
        if not obj.data.uv_layers:
            raise ValueError(f'UVがありません: {obj.name}')
        if not obj.data.materials:
            obj.data.materials.append(bpy.data.materials.new('SourceMaterial'))
        for material in obj.data.materials:
            if material is None:
                raise ValueError('空のマテリアルスロット')
            material.use_nodes = True
            nodes = material.node_tree.nodes
            texnodes = [n for n in nodes if n.type == 'TEX_IMAGE']
            if not texnodes:
                texnodes = [nodes.new('ShaderNodeTexImage')]
                material.node_tree.links.new(texnodes[0].outputs['Color'], next(n for n in nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color'])
            for node in texnodes:
                if node.image and (node.image.packed_file or Path(bpy.path.abspath(node.image.filepath)).is_file()) and not explicit:
                    node.image.pack()
                    continue
                matches = [p for p in images if node.image and p.name == Path(node.image.filepath).name]
                candidates = matches or images
                if len(candidates) != 1:
                    raise ValueError(f'テクスチャを一意に解決できません: {obj.name}。textureを指定してください')
                node.image = bpy.data.images.load(str(candidates[0]), check_existing=True)
                node.image.pack()
                warnings.append(f'テクスチャ参照修復: {candidates[0].name}')
    conversion = axis_conversion(from_forward=c.get('forward', '-Y'), from_up=c.get('up', 'Z'), to_forward='-Y', to_up='Z').to_4x4()
    # オブジェクトの親階層を解消してから、変換を頂点へ焼く。
    for obj in meshes:
        world = conversion @ obj.matrix_world
        obj.parent = None
        obj.matrix_world.identity()
        obj.data.transform(world)
    points = [v.co for o in meshes for v in o.data.vertices]
    lo = Vector(tuple(min(v[i] for v in points) for i in range(3)))
    hi = Vector(tuple(max(v[i] for v in points) for i in range(3)))
    if hi.z - lo.z <= 1e-8:
        raise ValueError('モデルの高さがゼロ')
    factor = c.get('target_height', 1) / (hi.z - lo.z) * c.get('scale', 1)
    center = Vector(((lo.x + hi.x)/2, (lo.y + hi.y)/2, lo.z))
    for obj in meshes:
        for v in obj.data.vertices:
            v.co = (v.co - center) * factor
        obj.data.update()
    return meshes
