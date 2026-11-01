import copy
import json
import subprocess
import sys
import tempfile
import unittest
import zipfile
from unittest.mock import patch
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from common import ROOT, config, fingerprint, read, unpack, write
import cli


class PipelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        (ROOT/'reports').mkdir(parents=True,exist_ok=True)

    def test_input_and_output_guard(self):
        with tempfile.TemporaryDirectory(dir=ROOT / 'reports') as tmp:
            p = Path(tmp)/'config.json'
            c = read(ROOT/'configs/007_kappa.json')
            for field,value in [('input','../README.md'),('output','input'),('id','../bad'),('scale',0),('rig','floating')]:
                bad = dict(c, **{field:value})
                write(p,bad)
                with self.assertRaises((ValueError,NotImplementedError)):
                    config(p)

    def test_zip_traversal_and_case_insensitive_fbx(self):
        with tempfile.TemporaryDirectory(dir=ROOT / 'reports') as tmp:
            p = Path(tmp)
            with zipfile.ZipFile(p/'bad.zip','w') as z:
                z.writestr('../escape.fbx',b'x')
            with self.assertRaises(ValueError):
                unpack(p/'bad.zip',p/'out')
            with zipfile.ZipFile(p/'good.zip','w') as z:
                z.writestr('河童.FBX',b'x')
                z.writestr('河童_basecolor.JPEG',b'x')
            self.assertEqual(unpack(p/'good.zip',p/'out').name,'河童.FBX')

    def test_skeleton_contract(self):
        bones = read(ROOT/'rigs/humanoid_chibi.json')['bones']
        self.assertGreaterEqual(len(bones),12)
        self.assertLessEqual(len(bones),18)
        seen = set()
        for bone in bones:
            self.assertNotIn(bone['name'],seen)
            if bone['parent']:
                self.assertIn(bone['parent'],seen)
            seen.add(bone['name'])
        self.assertEqual(set(read(ROOT/'animations/humanoid_chibi.json')['clips']),{'Idle','Walk','Happy','Surprise','Appear'})

    def test_fingerprint_tracks_parameters(self):
        c = config(ROOT/'configs/007_kappa.json')
        modified = copy.deepcopy(c)
        modified['scale'] *= 2
        self.assertNotEqual(fingerprint(c),fingerprint(modified))

    def test_unknown_id_fails(self):
        p = subprocess.run([sys.executable,str(ROOT/'scripts/cli.py'),'--id','missing','--list'],capture_output=True)
        self.assertNotEqual(p.returncode,0)

    def test_batch_continues_and_retry_selects_only_failure(self):
        with tempfile.TemporaryDirectory(dir=ROOT / 'reports') as tmp:
            base = Path(tmp)
            configs = base/'configs'
            write(configs/'000_bad.json',{'id':'bad','name':'欠落','rig':'humanoid_chibi'})
            write(configs/'001_good.json',{'id':'good','name':'成功','rig':'humanoid_chibi'})
            source = base/'source.fbx'
            source.write_bytes(b'fixture')
            artifact = base/'result.glb'
            artifact.write_bytes(b'fixture')
            def fake_config(path):
                c=read(path)
                if c['id']=='bad':
                    raise ValueError('intentional failure')
                return dict(c,source_path=str(source))
            def fake_blender(command, **kwargs):
                write(Path(command[-1])/'quality.json',{'status':'ok','artifacts':[str(artifact)]})
                return subprocess.CompletedProcess(command,0)
            with patch.object(cli,'ROOT',base), patch.object(cli,'config',side_effect=fake_config), patch.object(cli,'fingerprint',return_value='digest'), patch.object(cli.subprocess,'run',side_effect=fake_blender) as run:
                with patch.object(sys,'argv',['cli','--blender','fake','--configs',str(configs)]):
                    self.assertEqual(cli.main(),1)
                self.assertEqual(run.call_count,1)
                state=read(base/'reports/state.json')
                self.assertEqual(state['bad']['status'],'failed')
                self.assertEqual(state['good']['status'],'ok')
                with patch.object(sys,'argv',['cli','--blender','fake','--configs',str(configs),'--changed','--id','good']):
                    self.assertEqual(cli.main(),0)
                self.assertEqual(run.call_count,1)
                with patch.object(sys,'argv',['cli','--blender','fake','--configs',str(configs),'--failed']):
                    self.assertEqual(cli.main(),1)
                self.assertEqual(run.call_count,1)


if __name__ == '__main__':
    unittest.main()
