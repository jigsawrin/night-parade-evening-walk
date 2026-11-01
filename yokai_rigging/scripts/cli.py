"""各キャラクターを独立したBlenderプロセスで処理する。"""
import argparse
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from common import ROOT, config, fingerprint, read, write


def main():
    p = argparse.ArgumentParser(description='百鬼夜行 自動リギング')
    p.add_argument('--id', action='append', help='複数指定可能')
    p.add_argument('--changed', action='store_true')
    p.add_argument('--failed', action='store_true')
    p.add_argument('--list', action='store_true')
    p.add_argument('--blender', default=os.environ.get('BLENDER', shutil.which('blender')))
    p.add_argument('--timeout', type=int, default=900)
    p.add_argument('--configs', type=Path, default=ROOT / 'configs')
    args = p.parse_args()
    statefile = ROOT / 'reports/state.json'
    state = read(statefile) if statefile.exists() else {}
    configs = sorted(args.configs.glob('*.json'))
    if not configs:
        print('設定ファイルがありません:', args.configs)
        return 1
    errors, found = 0, set()
    for path in configs:
        key = path.stem
        try:
            raw = read(path)
            key = raw['id']
            found.add(key)
            if args.id and key not in args.id:
                continue
            if args.list:
                print(key, raw['name'], raw['rig'], state.get(key, {}).get('status', '未実行'))
                continue
            if not raw.get('enabled', True):
                continue
            if args.failed and state.get(key, {}).get('status') != 'failed':
                continue
            c = config(path)
            digest = fingerprint(c)
            old = state.get(key, {})
            outputs_exist = all(Path(f).is_file() for f in old.get('artifacts', []))
            if args.changed and old.get('fingerprint') == digest and old.get('status') == 'ok' and outputs_exist and old.get('artifacts'):
                print(key, '変更なし')
                continue
            if not Path(c['source_path']).is_file():
                raise FileNotFoundError(f"入力モデルがありません: {c['source_path']}")
            if not args.blender:
                raise FileNotFoundError('--blender または BLENDER 環境変数で実行ファイルを指定してください')
            run = ROOT / 'reports' / key / (time.strftime('%Y%m%d-%H%M%S') + '-' + str(time.time_ns()))
            run.mkdir(parents=True)
            with (run / 'blender.log').open('w', encoding='utf-8') as log:
                env = dict(os.environ, PYTHONIOENCODING='utf-8', PYTHONUNBUFFERED='1')
                result = subprocess.run([args.blender, '--background', '--factory-startup', '--python-exit-code', '1', '--python', str(ROOT / 'scripts/worker.py'), '--', str(path.resolve()), str(run)], stdout=log, stderr=subprocess.STDOUT, timeout=args.timeout, env=env)
            reportfile = run / 'quality.json'
            report = read(reportfile) if reportfile.exists() else {}
            if result.returncode or report.get('status') != 'ok':
                raise RuntimeError(f"Blender処理失敗: {run / 'blender.log'}")
            state[key] = {'status': 'ok', 'fingerprint': digest, 'report': str(reportfile), 'artifacts': report['artifacts']}
            print(key, 'OK', reportfile)
        except Exception as exc:
            errors += 1
            state[key] = {'status': 'failed', 'error': str(exc)}
            print(key, '失敗:', exc)
        if not args.list:
            write(statefile, state)
    missing = set(args.id or []) - found
    for key in missing:
        print('不明なID:', key)
    return int(bool(errors or missing))


if __name__ == '__main__':
    sys.exit(main())
