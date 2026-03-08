import { VoxelKey, toKey, parseKey, HexColor, useVoxelStore } from "./store";

interface VoxelEntry {
  x: number;
  y: number;
  z: number;
  color: string;
}

interface VoxelEntry {
  x: number;
  y: number;
  z: number;
  color: string;
}

export function exportSceneJSON(voxels: Map<VoxelKey, HexColor>): string {
  const entries: VoxelEntry[] = [];
  for (const [key, color] of voxels) {
    const [x, y, z] = parseKey(key);
    entries.push({ x, y, z, color });
  }
  return JSON.stringify(entries, null, 2);
}

export function downloadScene(voxels: Map<VoxelKey, HexColor>): void {
  const json = exportSceneJSON(voxels);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "voxel-scene.json";
  a.click();
  URL.revokeObjectURL(url);
}

export function parseSceneJSON(json: string): [VoxelKey, HexColor][] {
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error("Expected JSON array");

  const colorRegex = /^#[0-9a-fA-F]{6}$/;
  const entries: [VoxelKey, HexColor][] = [];

  for (const v of parsed) {
    const gridSize = useVoxelStore.getState().gridSize;
    if (
      Number.isInteger(v.x) && v.x >= 0 && v.x < gridSize &&
      Number.isInteger(v.y) && v.y >= 0 && v.y < gridSize &&
      Number.isInteger(v.z) && v.z >= 0 && v.z < gridSize &&
      typeof v.color === "string" && v.color.startsWith("#")
    ) {
      entries.push([toKey(v.x, v.y, v.z), v.color]);
    }
  }

  return entries;
}
