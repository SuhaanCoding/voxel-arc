import { VoxelKey, HexColor, VoxelCommand } from "./store";
import { toKey, parseKey } from "./store";

export function boxFillCommands(
  start: [number, number, number],
  end: [number, number, number],
  color: HexColor,
  existingVoxels: Map<VoxelKey, HexColor>,
  gridSize: number,
): VoxelCommand[] {
  const minX = Math.max(0, Math.min(start[0], end[0]));
  const minY = Math.max(0, Math.min(start[1], end[1]));
  const minZ = Math.max(0, Math.min(start[2], end[2]));
  const maxX = Math.min(gridSize - 1, Math.max(start[0], end[0]));
  const maxY = Math.min(gridSize - 1, Math.max(start[1], end[1]));
  const maxZ = Math.min(gridSize - 1, Math.max(start[2], end[2]));

  const commands: VoxelCommand[] = [];
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        const key = toKey(x, y, z);
        if (!existingVoxels.has(key)) {
          commands.push({ type: "PLACE", key, color });
        }
      }
    }
  }
  return commands;
}

export function faceExtrudeCommands(
  hitKey: VoxelKey,
  normal: [number, number, number],
  voxels: Map<VoxelKey, HexColor>,
  gridSize: number,
): VoxelCommand[] {
  const hitColor = voxels.get(hitKey);
  if (!hitColor) return [];

  // Determine 2D neighbor offsets on the plane perpendicular to normal
  const [nx, ny, nz] = normal;
  let deltas: [number, number, number][];
  if (nx !== 0) {
    // Normal along X — plane is Y/Z
    deltas = [[0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  } else if (ny !== 0) {
    // Normal along Y — plane is X/Z
    deltas = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
  } else {
    // Normal along Z — plane is X/Y
    deltas = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]];
  }

  // BFS flood fill
  const visited = new Set<VoxelKey>();
  const queue: VoxelKey[] = [hitKey];
  visited.add(hitKey);
  const found: VoxelKey[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const [cx, cy, cz] = parseKey(current);

    // Check that this voxel has the exposed face (cell at current + normal is empty)
    const faceKey = toKey(cx + nx, cy + ny, cz + nz);
    if (voxels.has(faceKey)) continue; // face is blocked

    found.push(current);

    for (const [dx, dy, dz] of deltas) {
      const neighborKey = toKey(cx + dx, cy + dy, cz + dz);
      if (visited.has(neighborKey)) continue;
      visited.add(neighborKey);
      const neighborColor = voxels.get(neighborKey);
      if (neighborColor === hitColor) {
        queue.push(neighborKey);
      }
    }
  }

  // Generate PLACE commands at each found position + normal
  const commands: VoxelCommand[] = [];
  for (const key of found) {
    const [x, y, z] = parseKey(key);
    const px = x + nx, py = y + ny, pz = z + nz;
    if (px < 0 || px >= gridSize || py < 0 || py >= gridSize || pz < 0 || pz >= gridSize) continue;
    const placeKey = toKey(px, py, pz);
    if (voxels.has(placeKey)) continue;
    commands.push({ type: "PLACE", key: placeKey, color: hitColor });
  }
  return commands;
}

export function getMirroredPositions(
  positions: [number, number, number][],
  mirrorAxes: { x: boolean; y: boolean; z: boolean },
  gridSize: number,
): [number, number, number][] {
  let result = [...positions];

  if (mirrorAxes.x) {
    const mirrored: [number, number, number][] = [];
    for (const [x, y, z] of result) {
      mirrored.push([gridSize - 1 - x, y, z]);
    }
    result = [...result, ...mirrored];
  }

  if (mirrorAxes.y) {
    const mirrored: [number, number, number][] = [];
    for (const [x, y, z] of result) {
      mirrored.push([x, gridSize - 1 - y, z]);
    }
    result = [...result, ...mirrored];
  }

  if (mirrorAxes.z) {
    const mirrored: [number, number, number][] = [];
    for (const [x, y, z] of result) {
      mirrored.push([x, y, gridSize - 1 - z]);
    }
    result = [...result, ...mirrored];
  }

  // Deduplicate
  const seen = new Set<string>();
  return result.filter(([x, y, z]) => {
    const k = `${x},${y},${z}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
