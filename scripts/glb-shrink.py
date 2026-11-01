"""
GLB のテクスチャを、取り込み前に縮める（開発時だけ。Python 3 と Pillow が要る：pip install pillow）。

  python scripts/glb-shrink.py <元.glb> [出力.glb] [--size 1024]   # 出力の既定は public/models/<元と同じ名前>

- GLB に埋め込まれた画像を、長辺が --size（既定 1024）に収まるまで縮める。拡大はしない。縮めたあとの画像は、
  透明があれば PNG、なければ JPEG（quality 90）。形・骨格・アニメーションには触れない
- 通常の妖怪は 1024、雪女・八尺様・大妖怪は 2048（--size 2048）を目安にする。2048² は約 16MB、4096² は約 64MB の GPU メモリを使う
- 画像が外部ファイル（uri）の GLB は扱わない（止める）
"""
import argparse
import io
import json
import struct
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "models"
MAGIC = 0x46546C67
JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942


def read_glb(path: Path):
    data = path.read_bytes()
    magic, version, _ = struct.unpack_from("<III", data, 0)
    if magic != MAGIC or version != 2:
        sys.exit(f"{path.name}: GLB 2.0 ではない")
    doc, blob, pos = None, b"", 12
    while pos < len(data):
        length, kind = struct.unpack_from("<II", data, pos)
        body = data[pos + 8 : pos + 8 + length]
        if kind == JSON_CHUNK:
            doc = json.loads(body.decode("utf-8"))
        elif kind == BIN_CHUNK:
            blob = body
        pos += 8 + length
    if doc is None:
        sys.exit(f"{path.name}: JSON チャンクが無い")
    return doc, blob


def shrink_image(raw: bytes, size: int):
    img = Image.open(io.BytesIO(raw))
    img.load()
    if max(img.size) > size:
        scale = size / max(img.size)
        img = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.LANCZOS)
    out = io.BytesIO()
    if "A" in img.getbands() and img.getchannel("A").getextrema()[0] < 255:
        img.convert("RGBA").save(out, "PNG", optimize=True)
        return out.getvalue(), "image/png", img.size
    img.convert("RGB").save(out, "JPEG", quality=90, optimize=True)
    return out.getvalue(), "image/jpeg", img.size


def pad4(b: bytes, fill: bytes) -> bytes:
    return b + fill * (-len(b) % 4)


def shrink(src: Path, dst: Path, size: int):
    doc, blob = read_glb(src)
    views = doc.get("bufferViews", [])
    images = doc.get("images", [])
    replaced = {}
    for i, im in enumerate(images):
        if "bufferView" not in im:
            sys.exit(f"{src.name}: 画像 {i} が外部ファイル。埋め込み GLB にしてから")
        v = views[im["bufferView"]]
        raw = blob[v.get("byteOffset", 0) : v.get("byteOffset", 0) + v["byteLength"]]
        new, mime, dim = shrink_image(raw, size)
        replaced[im["bufferView"]] = new
        im["mimeType"] = mime
        print(f"  画像 {i}: {len(raw) // 1024}KB → {len(new) // 1024}KB（{dim[0]}×{dim[1]}）")
    parts, cursor = [], 0
    for i, v in enumerate(views):
        body = replaced.get(i)
        if body is None:
            body = blob[v.get("byteOffset", 0) : v.get("byteOffset", 0) + v["byteLength"]]
        v["byteOffset"], v["byteLength"] = cursor, len(body)
        body = pad4(body, b"\0")
        parts.append(body)
        cursor += len(body)
    new_blob = b"".join(parts)
    if doc.get("buffers"):
        doc["buffers"][0]["byteLength"] = len(new_blob)
    js = pad4(json.dumps(doc, separators=(",", ":")).encode("utf-8"), b" ")
    total = 12 + 8 + len(js) + (8 + len(new_blob) if new_blob else 0)
    out = struct.pack("<III", MAGIC, 2, total) + struct.pack("<II", len(js), JSON_CHUNK) + js
    if new_blob:
        out += struct.pack("<II", len(new_blob), BIN_CHUNK) + new_blob
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_bytes(out)
    print(f"{src.name}: {src.stat().st_size // 1024}KB → {dst.stat().st_size // 1024}KB  {dst}")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    ap.add_argument("src", type=Path)
    ap.add_argument("dst", type=Path, nargs="?")
    ap.add_argument("--size", type=int, default=1024)
    a = ap.parse_args()
    dst = a.dst or OUT / a.src.name
    if dst.resolve() == a.src.resolve():
        sys.exit("元と同じ場所には書かない（元を残す）")
    shrink(a.src, dst, a.size)


if __name__ == "__main__":
    main()
