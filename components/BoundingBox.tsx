"use client";

import { Edges } from "@react-three/drei";
import { BoxGeometry } from "three";
import { useVoxelStore } from "@/lib/store";

export default function BoundingBox() {
  const gridSize = useVoxelStore((s) => s.gridSize);
  const box = new BoxGeometry(gridSize, gridSize, gridSize);

  // Center is gridSize/2 - 0.5 because voxels are 1x1x1 and centered on integers (0 to gridSize-1)
  // For a 50x50x50 grid, min is 0, max is 49. Center is 24.5.
  const center = gridSize / 2 - 0.5;

  return (
    <group position={[center, center, center]}>
      <Edges geometry={box}>
        <lineBasicMaterial color="#555555" />
      </Edges>
    </group>
  );
}
