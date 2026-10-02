/** 百鬼夜行の「格」によって開く世界の層（仕様 11章） */
export interface WorldLayerDef {
  id: string;
  minCount: number;
  title: string;
  text: string;
}
export const WORLD_LAYERS: WorldLayerDef[] = [
  { id: "rooftops", minCount: 10, title: "屋根の上", text: "屋根の上から、何かがこちらを覗いている…" },
  { id: "alleyFestival", minCount: 20, title: "裏路地の妖怪祭り", text: "長屋の裏路地で、妖怪たちの祭りが始まった" },
  { id: "yokaiBoat", minCount: 30, title: "妖怪船", text: "川に灯りをともした妖怪船が現れた" },
  { id: "sky", minCount: 40, title: "空から", text: "夜空に白い布がひらひらと…" },
  { id: "yokocho", minCount: 45, title: "妖怪横丁", text: "西の大木戸が開き、人には見えぬ妖怪横丁が現れた" },
];
