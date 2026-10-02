// ビルドの大きさの見張り（npm run build の後に。CI でも動く）。
// 最初に読む JS（index-*.js）が上限を超えたら失敗する。Babylon を core/babylon.ts 以外から読む・MeshBuilder 全体を読む、
// などで一気に大きくなったときに気づくため。上限を上げるときは、理由を docs/architecture.md の「読み込み」に書く。
// フォントの 2000KB は最終の上限（これ以上は上げない。超えそうなら削る：docs/architecture.md「読み込み」）。
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const LIMIT_KB = { mainJs: 1400, css: 120, fonts: 2000 };
const dir = "dist/assets";
const files = readdirSync(dir).map((f) => ({ f, kb: statSync(join(dir, f)).size / 1024 }));
const sum = (re) => files.filter((x) => re.test(x.f)).reduce((a, x) => a + x.kb, 0);
const main = files.filter((x) => /^index-.*\.js$/.test(x.f)).reduce((a, x) => Math.max(a, x.kb), 0);
const rows = [
  ["最初に読む JS", main, LIMIT_KB.mainJs],
  ["CSS", sum(/\.css$/), LIMIT_KB.css],
  ["フォント（全書体の合計。使う太さだけ読まれる）", sum(/\.woff2$/), LIMIT_KB.fonts],
];
let ok = true;
for (const [name, kb, lim] of rows) {
  const pass = kb <= lim;
  ok &&= pass;
  console.log(`${pass ? "ok " : "NG "} ${name}: ${kb.toFixed(0)} KB（上限 ${lim} KB）`);
}
if (!ok) process.exit(1);
