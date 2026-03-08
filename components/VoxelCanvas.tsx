"use client";

import "@/lib/three-setup"; // Patch BVH before any Three.js code runs
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

// import { EffectComposer, SSAO } from "@react-three/postprocessing";
import { ErrorBoundary } from "react-error-boundary";

import { useVoxelStore } from "@/lib/store";
import VoxelRenderer from "./VoxelRenderer";
import BoundingBox from "./BoundingBox";

function ErrorFallback() {
  return (
    <div className="flex h-full items-center justify-center bg-gray-900 text-white">
      <div className="text-center">
        <h2 className="text-xl font-bold mb-2">3D Rendering Failed</h2>
        <p className="text-gray-400">
          Please refresh the page or try a different browser.
        </p>
      </div>
    </div>
  );
}

export default function VoxelCanvas() {
  const gridSize = useVoxelStore((s) => s.gridSize);
  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <Canvas
        orthographic
        camera={{ position: [gridSize * 1.5, gridSize * 1.5, gridSize * 1.5], zoom: 8, near: -1000, far: 2000 }}
        gl={{ antialias: true }}
        style={{ background: "#1a1a1a" }}
        onPointerMissed={() => {
          const store = useVoxelStore.getState();
          if (store.activeMode === "select") {
            store.deselectAll();
          }
        }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[gridSize / 2, gridSize, gridSize / 2]} intensity={1} />
        <BoundingBox />
        <VoxelRenderer />
        <OrbitControls
          makeDefault
          mouseButtons={{
            LEFT: -1 as THREE.MOUSE,
            MIDDLE: THREE.MOUSE.PAN,
            RIGHT: THREE.MOUSE.ROTATE,
          }}
          enableDamping={false}
        />
        {/* SSAO disabled — crashes R3F render loop with Three.js r183, breaking useFrame + interactions
        <EffectComposer>
          <SSAO radius={0.4} intensity={30} luminanceInfluence={0.6} samples={16} />
        </EffectComposer>
        */}
      </Canvas>
    </ErrorBoundary>
  );
}
