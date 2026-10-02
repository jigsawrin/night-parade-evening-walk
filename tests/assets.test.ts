// 構成の約束を守れているか（このゲームだけで完結・軽い読み込み・肥大化しない）
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
// @ts-expect-error 開発用スクリプト（型定義なし）
import { collectChars, stripComments } from "../scripts/fonts.mjs";

const files = (dir: string, re: RegExp): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p, re) : re.test(f) ? [p.replace(/\\/g, "/")] : [];
  });
const SRC = files("src", /\.(ts|css)$/);
const CODE = SRC.filter((f) => f.endsWith(".ts"));
const read = (f: string) => readFileSync(f, "utf8");

test("同梱フォントに、画面に出る字がすべて入っている（足りなければ npm run fonts）", () => {
  const have = new Set(read("src/assets/fonts/charset.txt"));
  const missing = (collectChars() as string[]).filter((c) => !have.has(c));
  assert.deepEqual(missing, [], `フォントに無い字：${missing.join("")}　→ npm run fonts を実行する`);
});

test("fonts.css が指すフォントファイルがある", () => {
  const css = read("src/assets/fonts/fonts.css");
  const urls = [...css.matchAll(/url\("\.\/([^"]+)"\)/g)].map((m) => m[1]);
  assert.ok(urls.length >= 6);
  for (const u of urls) assert.ok(existsSync(join("src/assets/fonts", u)), u);
  for (const fam of ["Yuji Syuku", "Shippori Mincho", "Kaisei Decol"]) assert.ok(css.includes(`"${fam}"`), fam);
});

test("実行時に外部へつながない（URL・外部 CDN・Google Fonts を読まない）", () => {
  const html = read("index.html");
  assert.ok(!/<(link|script)[^>]+https?:\/\//.test(html), "index.html が外部を読んでいる");
  for (const f of SRC) {
    const t = stripComments(read(f), f) as string;
    assert.ok(!/https?:\/\//.test(t), `${f} に外部 URL がある`);
    assert.ok(!/\b(XMLHttpRequest|WebSocket|sendBeacon|EventSource)\b/.test(t), `${f} が通信している`);
  }
  // fetch はデータ URL（写真の変換）だけ
  for (const f of CODE) for (const m of read(f).matchAll(/fetch\(([^)]*)\)/g)) assert.equal(m[1], "url", `${f}: fetch(${m[1]})`);
});

test("Babylon は core/babylon.ts からだけ読む（一括 import でエンジン全部を読み込まない）", () => {
  for (const f of CODE) {
    if (f === "src/core/babylon.ts") continue;
    assert.ok(!/from\s+"@babylonjs\//.test(read(f)), `${f} が @babylonjs を直接読んでいる → core/babylon.ts から`);
    assert.ok(!/import\("@babylonjs\//.test(read(f)), `${f} が @babylonjs を直接読んでいる → core/babylon.ts から`);
  }
  const facade = read("src/core/babylon.ts");
  assert.ok(!/from\s+"@babylonjs\/core"/.test(facade), "core/babylon.ts が一括 import している");
  assert.ok(!/Meshes\/meshBuilder"/.test(facade), "MeshBuilder 全体を読んでいる（使う形だけを読む）");
});

test("ファイルが大きくなりすぎていない（600 行まで。超えたら分ける：CLAUDE.md）", () => {
  const big = CODE.map((f) => [f, read(f).split("\n").length] as const).filter(([, n]) => n > 600);
  assert.deepEqual(big, [], `分ける：${big.map(([f, n]) => `${f}（${n} 行）`).join("、")}`);
});

test("実行時の依存は Babylon だけ", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ["@babylonjs/core", "@babylonjs/loaders"]);
});
