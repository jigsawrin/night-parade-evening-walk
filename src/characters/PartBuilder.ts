import { Color3, Color4, Mesh, MeshBuilder, Scene, VertexBuffer } from "../core/babylon";
import type { Part } from "./models";

const colorCache = new Map<string, Color4>();
export function hex(c: string): Color4 {
  let v = colorCache.get(c);
  if (!v) {
    const c3 = Color3.FromHexString(c);
    v = new Color4(c3.r, c3.g, c3.b, 1);
    colorCache.set(c, v);
  }
  return v;
}

/** メッシュ全頂点に単色の頂点カラーを焼き込む */
export function paint(mesh: Mesh, c: Color4 | string) {
  const col = typeof c === "string" ? hex(c) : c;
  const n = mesh.getTotalVertices();
  const arr = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    arr[i * 4] = col.r;
    arr[i * 4 + 1] = col.g;
    arr[i * 4 + 2] = col.b;
    arr[i * 4 + 3] = 1;
  }
  mesh.setVerticesData(VertexBuffer.ColorKind, arr);
}

/** 部品定義 → 変換済み・頂点カラー付きの Mesh */
export function buildPart(scene: Scene, part: Part, low = false): Mesh {
  const seg = low ? 5 : 9;
  const sc = part.sc === undefined ? [1, 1, 1] : typeof part.sc === "number" ? [part.sc, part.sc, part.sc] : part.sc;
  let m: Mesh;
  switch (part.s) {
    case "sphere":
      m = MeshBuilder.CreateSphere("p", { diameter: 1, segments: low ? 3 : 6 }, scene);
      break;
    case "box":
      m = MeshBuilder.CreateBox("p", { size: 1 }, scene);
      break;
    case "cyl":
    case "cone":
      m = MeshBuilder.CreateCylinder(
        "p",
        { height: 1, diameterBottom: 1, diameterTop: part.s === "cone" ? 0 : (part.top ?? 1), tessellation: seg + 3 },
        scene,
      );
      break;
    case "torus":
      m = MeshBuilder.CreateTorus("p", { diameter: 1, thickness: (part.th ?? 0.05) / (sc[0] || 1), tessellation: low ? 10 : 18 }, scene);
      break;
  }
  m.scaling.set(sc[0], sc[1], sc[2]);
  if (part.r) m.rotation.set(part.r[0], part.r[1], part.r[2]);
  m.position.set(part.p[0], part.p[1], part.p[2]);
  m.bakeCurrentTransformIntoVertices();
  paint(m, part.c);
  return m;
}
