"""Blenderでテスト専用の別体型を生成。実妖怪の検証とは区別する。"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import bpy
from common import ROOT, read, write

bpy.ops.wm.read_factory_settings(use_empty=True)
folder = ROOT / 'input/_test_chibi'
folder.mkdir(parents=True,exist_ok=True)
image = bpy.data.images.new('fixture',width=16,height=16)
image.generated_color = (.2,.6,.9,1)
image.filepath_raw = str(folder/'fixture.png')
image.file_format = 'PNG'
image.save()
material = bpy.data.materials.new('fixture')
material.use_nodes = True
node = material.node_tree.nodes.new('ShaderNodeTexImage')
node.image = image
material.node_tree.links.new(node.outputs['Color'],material.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
parts=[]
for name,loc,size in [('body',(0,0,.46),(.22,.15,.24)),('head',(0,0,.84),(.31,.23,.28)),
    ('legL',(.14,0,.18),(.08,.1,.18)),('legR',(-.14,0,.18),(.08,.1,.18)),
    ('armL',(.32,0,.47),(.16,.07,.08)),('armR',(-.32,0,.47),(.16,.07,.08))]:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=8,ring_count=4,location=loc)
    obj=bpy.context.object
    obj.name=name
    obj.scale=size
    obj.data.materials.append(material)
    parts.append(obj)
bpy.ops.object.select_all(action='SELECT')
bpy.context.view_layer.objects.active=parts[0]
bpy.ops.object.join()
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
bpy.ops.export_scene.fbx(filepath=str(folder/'fixture.fbx'),use_selection=True,add_leaf_bones=False,bake_anim=False,path_mode='COPY',embed_textures=False)
c=read(ROOT/'configs/007_kappa.json')
c.update(id='test_chibi',name='別体型の合成テスト',number=0,input='input/_test_chibi/fixture.fbx',previews=False,weight_method='distance',rigid_regions=[],bone_overrides={})
write(ROOT/'reports/test-configs/000_test_chibi.json',c)
bad=dict(c,id='test_missing',input='input/_missing/none.fbx')
write(ROOT/'reports/test-configs/001_test_missing.json',bad)
unsupported=dict(c,id='test_floating',rig='floating')
write(ROOT/'reports/test-configs/002_test_floating.json',unsupported)
