"""CLIから呼び出すBlenderエントリポイント。"""
import sys
import traceback
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy
from common import config, write
from scene_io import load
from rigging import create, bind
from motion import build
from quality import mesh_report, skin_report, materials, deformation, findings
from exporting import export, reload_check


def main():
    args = sys.argv[sys.argv.index('--')+1:]
    path, run = Path(args[0]), Path(args[1])
    bpy.context.preferences.filepaths.file_preview_type = 'NONE'
    report = {'status':'failed', 'blender':bpy.app.version_string, 'warnings':[],
        'manual_review':['正面軸と骨位置','頭・甲羅・皿・装飾の形状保持','全クリップの自然さ・接地・貫通','Web実機再生','Roblox Studioでのインポートと再生'], 'repairs':[]}
    try:
        c = config(path)
        report['config'] = c
        meshes = load(c, run, report['warnings'])
        report['input_meshes'] = mesh_report(meshes)
        report['mesh_findings'] = findings(report['input_meshes'], c.get('quality_exceptions', {}))
        report['materials'] = materials(meshes)
        arm = create(meshes, c, report['warnings'])
        report['binding'] = bind(meshes, arm, c, report['warnings'])
        report['skin'] = skin_report(meshes, arm)
        if any(report['skin'][k] for k in ('unassigned','over_four','root_weights','unnormalized')):
            raise ValueError('ウェイト検査失敗')
        actions = build(arm, c)
        if not actions:
            raise ValueError('アニメーションが未指定')
        report['deformation'] = deformation(meshes, arm, actions)
        report['clips'] = [dict(name=a.name, start=1, end=end, loop=bool(a['loop'])) for a,end in actions]
        names = [a.name for a,end in actions]
        glb, fbx, blend, clips, previews = export(c, run, meshes, arm, actions)
        report['artifacts'] = [str(p) for p in [glb,fbx,blend,*[p for p,n in clips],*previews]]
        report['roundtrip'] = []
        for target, clipnames in [(glb,names),(fbx,[]),(blend,names),*[(p,[n]) for p,n in clips]]:
            check = reload_check(target, report['skin']['bones'], clipnames)
            if sum(m['triangles'] for m in check['meshes']) != sum(m['triangles'] for m in report['input_meshes']):
                raise ValueError(f'再読込で三角形数が変化: {target}')
            if any(m['uv_layers'] < 1 for m in check['meshes']):
                raise ValueError(f'再読込でUVが欠落: {target}')
            report['roundtrip'].append(check)
        report['status'] = 'ok'
    except Exception:
        report['error'] = traceback.format_exc()
        raise
    finally:
        write(run / 'quality.json', report)


if __name__ == '__main__':
    main()
