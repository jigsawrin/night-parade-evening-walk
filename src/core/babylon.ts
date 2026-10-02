/**
 * Babylon.js の入口（ここだけが @babylonjs/core を読む）。
 *
 * `@babylonjs/core` の一括 import はエンジン全部（約 5MB）を読み込んでしまうので、使う部品だけを
 * 個別のパスから読む。ゲームのコードは必ずここから import する（tests/assets.test.ts が確かめる）。
 * 新しい部品が要るときは、ここに 1 行足す。クラスの「機能の追加」だけを担うモジュール（side effect）は下の
 * import "…" に足す（例：scene.createPickingRay は Culling/ray が無いと動かない）。
 */

// ---- 機能の追加（読むだけで Scene・Mesh などに機能が生える）
import "@babylonjs/core/Culling/ray"; // scene.createPickingRay（タップした地面）
import "@babylonjs/core/Layers/effectLayerSceneComponent"; // GlowLayer
import "@babylonjs/core/Particles/particleSystemComponent"; // ParticleSystem
import "@babylonjs/core/Materials/multiMaterial"; // Mesh.MergeMeshes(…, subdivideWithSubMeshes)

import { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { Scene } from "@babylonjs/core/scene";
export { AbstractEngine, Camera, Scene };
export { Engine } from "@babylonjs/core/Engines/engine";
export { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
export { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
export { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
export { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
export { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
export { PointLight } from "@babylonjs/core/Lights/pointLight";
export { Material } from "@babylonjs/core/Materials/material";
export { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
export { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
export { FresnelParameters } from "@babylonjs/core/Materials/fresnelParameters";
export { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
export { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
export { Texture } from "@babylonjs/core/Materials/Textures/texture";
export { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
export { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
export { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
export { Mesh } from "@babylonjs/core/Meshes/mesh";
export { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
export { SubMesh } from "@babylonjs/core/Meshes/subMesh";
export { TransformNode } from "@babylonjs/core/Meshes/transformNode";
export { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
export { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
export { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";

// ---- 形の生成：MeshBuilder は全形状（文字・多面体…）を読み込むので、使う形だけを同じ名前でまとめる
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
export const MeshBuilder = { CreateBox, CreateCylinder, CreateDisc, CreateGround, CreatePlane, CreateSphere, CreateTorus };

// ---- 使うときだけ読む（最初の読み込みに入れない）
/** 写真：画面を画像にする（記念撮影で初めて読む） */
export async function captureScreenshot(engine: AbstractEngine, camera: Camera, mime = "image/png"): Promise<string> {
  const { CreateScreenshotAsync } = await import("@babylonjs/core/Misc/screenshotTools");
  return CreateScreenshotAsync(engine, camera, { precision: 1 }, mime);
}
/** GLB の読み込み（yokaiTypes の modelUrl があるときだけ） */
export async function loadGlbMeshes(url: string, scene: Scene) {
  const [{ ImportMeshAsync }] = await Promise.all([import("@babylonjs/core/Loading/sceneLoader"), import("@babylonjs/loaders/glTF")]);
  return ImportMeshAsync(url, scene);
}
