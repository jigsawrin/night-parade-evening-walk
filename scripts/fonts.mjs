// フォントの同梱（開発時だけ使う。ゲームの実行時は外部へ一切つながらない）。
//
//   npm run fonts
//
// src/・index.html の画面に出る文字（コメントは除く。＋ひらがな・カタカナ・記号の全部）だけを含むサブセットを
// Google Fonts の text= 指定で取得し、src/assets/fonts/ に woff2 と fonts.css を書き出す。
// 画面の文言を足したら実行する（足りない字は tests/assets.test.ts が教えてくれる。足りなくても serif に落ちて遊べる）。
// フォントは SIL Open Font License 1.1（LICENSES/fonts.md）。追加の npm 依存なし。
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = "src/assets/fonts";
/** 家族・太さ（style.css の --font-head / --font-body / --font-deco と canvas で使うもの） */
const FACES = [
  { family: "Yuji Syuku", weights: [400] },
  { family: "Shippori Mincho", weights: [400, 800] }, // 600・700 は 800 で表示される（同梱を減らす）
  { family: "Kaisei Decol", weights: [400, 700] },
];
/** 一度に頼む字数（URL の長さの上限に収める） */
const CHUNK = 700;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/** コメントを除く（画面に出ない字まで同梱しない） */
export function stripComments(text, file) {
  let t = text.replace(/\/\*[\s\S]*?\*\//g, "");
  if (file.endsWith(".html")) return t.replace(/<!--[\s\S]*?-->/g, "");
  // 行コメント（URL の "https://" などは除かない）
  return t.replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/** 同梱する文字（テストからも使う） */
export function collectChars(root = ".") {
  const files = [join(root, "index.html")];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|css|html)$/.test(f)) files.push(p);
    }
  };
  walk(join(root, "src"));
  const set = new Set();
  const add = (c) => set.add(String.fromCodePoint(c));
  for (let c = 0x20; c <= 0x7e; c++) add(c); // ASCII
  for (let c = 0x3000; c <= 0x30ff; c++) add(c); // 和文の記号・ひらがな・カタカナ
  for (let c = 0xff01; c <= 0xff5e; c++) add(c); // 全角英数・記号
  for (const f of files) {
    for (const ch of stripComments(readFileSync(f, "utf8"), f)) {
      const c = ch.codePointAt(0);
      // 絵文字などフォントに無いものは除く
      if (c > 0x7e && c <= 0xffff && !(c >= 0x2600 && c <= 0x27bf) && !(c >= 0xd800 && c <= 0xdfff) && c !== 0xfe0f) set.add(ch);
    }
  }
  return [...set].sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
}

async function get(url, binary = false) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${url.slice(0, 120)}`);
  return binary ? Buffer.from(await res.arrayBuffer()) : res.text();
}

async function main() {
  const chars = collectChars();
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  let css = "/* npm run fonts が生成（手で直さない）。SIL Open Font License 1.1：LICENSES/fonts.md */\n";
  let total = 0;
  for (const { family, weights } of FACES) {
    for (const w of weights) {
      for (let i = 0; i < chars.length; i += CHUNK) {
        const text = chars.slice(i, i + CHUNK).join("");
        const q = `family=${family.replace(/ /g, "+")}:wght@${w}&text=${encodeURIComponent(text)}&display=swap`;
        const sheet = await get(`https://fonts.googleapis.com/css2?${q}`);
        for (const block of sheet.match(/@font-face\s*{[^}]*}/g) ?? []) {
          const src = block.match(/url\(([^)]+)\)/)?.[1];
          const range = block.match(/unicode-range:\s*([^;]+);/)?.[1];
          if (!src) continue;
          const bin = await get(src, true);
          const name = `${family.replace(/ /g, "")}-${w}-${createHash("sha1").update(bin).digest("hex").slice(0, 8)}.woff2`;
          writeFileSync(join(OUT, name), bin);
          total += bin.length;
          css += `@font-face {\n  font-family: "${family}";\n  font-style: normal;\n  font-weight: ${w};\n  font-display: swap;\n  src: url("./${name}") format("woff2");\n${range ? `  unicode-range: ${range};\n` : ""}}\n`;
        }
      }
      console.log(`${family} ${w}`);
    }
  }
  writeFileSync(join(OUT, "fonts.css"), css);
  writeFileSync(join(OUT, "charset.txt"), chars.join(""));
  console.log(`${chars.length} 字、合計 ${(total / 1024).toFixed(0)} KB → ${OUT}`);
}

if (process.argv[1] && process.argv[1].endsWith("fonts.mjs")) await main();
