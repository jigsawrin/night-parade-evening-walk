"""
妖怪の墨絵（水墨画）を、元絵から図鑑用の WebP に変換する（開発時だけ。Python 3 と Pillow が要る：pip install pillow）。

  python scripts/yokai-ink.py            # art-source/yokai-ink/original/ → public/yokai-ink/<ID>.webp

- 元絵は art-source/yokai-ink/original/（重いので git に入れない：.gitignore）。名前は「NN_妖怪名_<ID>.png」、
  00_manifest.json に ID と sha256 がある（sha256 が合わなければ止める）
- 透明な余白を切り落とし（周りに 2% だけ残す）、800×1000 の枠に収まるまで縮める（比率は元のまま。拡大はしない）。
  800×1000 は図鑑の姿の枠（CSS で最大 380×475px）を 2 倍の画面でもにじまない大きさ
- WebP の quality 92（見た目では元絵と区別できない。透明度は劣化させない alpha_quality 100）。1 枚 200KB ほど。
  図鑑では近くまでスクロールしたときに読む（loading="lazy"）ので、最初の読み込みには入らない
- 登録は src/data/yokaiInk.ts の INKED（新しい妖怪の絵を足したら、そこにも ID を足す）
"""
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art-source" / "yokai-ink" / "original"
OUT = ROOT / "public" / "yokai-ink"
BOX = (800, 1000)
PAD = 0.02
ALPHA_CUT = 8
WEBP = dict(quality=92, alpha_quality=100, method=6)


def convert(src: Path, dst: Path):
    im = Image.open(src).convert("RGBA")
    bb = im.getchannel("A").point(lambda v: 255 if v > ALPHA_CUT else 0).getbbox()
    if bb:
        p = int(max(im.size) * PAD)
        im = im.crop((max(0, bb[0] - p), max(0, bb[1] - p), min(im.width, bb[2] + p), min(im.height, bb[3] + p)))
    im.thumbnail(BOX, Image.LANCZOS)
    im.save(dst, "WEBP", **WEBP)
    return im.size


def main():
    manifest = json.loads((SRC / "00_manifest.json").read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    for e in manifest["images"]:
        src = SRC / e["filename"]
        if hashlib.sha256(src.read_bytes()).hexdigest() != e["sha256"]:
            sys.exit(f"sha256 が合わない：{e['filename']}")
        dst = OUT / f"{e['id']}.webp"
        size = convert(src, dst)
        kb = dst.stat().st_size / 1024
        total += kb
        print(f"{e['id']:<16} {size[0]}x{size[1]}  {kb:.0f} KB")
    print(f"{len(manifest['images'])} 枚、合計 {total / 1024:.1f} MB → {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
