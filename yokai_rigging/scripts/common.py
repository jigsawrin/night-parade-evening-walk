"""Blender非依存の設定・入力検証。"""
import hashlib
import json
import math
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FAMILIES = ('humanoid_chibi', 'one_leg', 'floating', 'quadruped', 'serpentine')


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def write(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')


def inside(path, base):
    path = Path(path).resolve()
    if not path.is_relative_to(Path(base).resolve()):
        raise ValueError(f'許可範囲外のパス: {path}')
    return path


def config(path):
    c = read(path)
    if not re.fullmatch(r'[a-z0-9][a-z0-9_-]*', c['id']):
        raise ValueError('id は安定した英小文字・数字・_・-で指定してください')
    if c['rig'] not in FAMILIES:
        raise ValueError('不明なリグ分類')
    if c['rig'] != 'humanoid_chibi':
        raise NotImplementedError(f"未対応リグ: {c['rig']}")
    if not math.isfinite(c.get('scale', 1)) or c.get('scale', 1) <= 0:
        raise ValueError('scale は正の有限数')
    if not math.isfinite(c.get('target_height', 1)) or c.get('target_height', 1) <= 0:
        raise ValueError('target_height は正の有限数')
    clips = c.get('animations', {})
    if not isinstance(clips, dict) or not clips:
        raise ValueError('animations には少なくとも1つのクリップを指定してください')
    for options in clips.values():
        for key in ('duration', 'speed', 'amplitude'):
            value = options.get(key, 1)
            if not math.isfinite(value) or (key != 'amplitude' and value <= 0):
                raise ValueError(f'不正なアニメーション設定: {key}')
    if c.get('forward', '-Y').lstrip('-') == c.get('up', 'Z').lstrip('-'):
        raise ValueError('forward と up は異なる軸')
    c['source_path'] = str(inside(ROOT / c['input'], ROOT / 'input'))
    c['output_path'] = str(inside(ROOT / c.get('output', 'output'), ROOT / 'output'))
    return c


def fingerprint(c):
    h = hashlib.sha256(json.dumps(c, sort_keys=True).encode())
    source = Path(c['source_path'])
    files = [source] if source.is_file() else []
    if source.is_file() and source.suffix.lower() != '.zip':
        files = sorted(p for p in source.parent.rglob('*') if p.is_file())
    for folder in ('scripts', 'rigs', 'animations'):
        files += sorted(p for p in (ROOT / folder).rglob('*') if p.suffix in ('.py', '.json'))
    for p in files:
        h.update(str(p.relative_to(ROOT)).encode())
        h.update(p.read_bytes())
    return h.hexdigest()


def unpack(source, destination):
    """ZIP slip、リンク、過大な展開を拒否。原本には書き込まない。"""
    destination = Path(destination)
    with zipfile.ZipFile(source) as z:
        if sum(i.file_size for i in z.infolist()) > 1024**3:
            raise ValueError('ZIP展開サイズが1GBを超えています')
        for item in z.infolist():
            target = inside(destination / item.filename, destination)
            if (item.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError('ZIP内のシンボリックリンクは非対応')
            if item.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(z.read(item))
    models = sorted(p for p in destination.rglob('*') if p.suffix.lower() == '.fbx')
    if len(models) != 1:
        raise ValueError(f'ZIP内FBXは1個にしてください: {len(models)}')
    return models[0]
