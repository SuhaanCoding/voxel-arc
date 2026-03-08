"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import Toolbar from "@/components/Toolbar";
import ColorPalette from "@/components/ColorPalette";
import StatusBar from "@/components/StatusBar";
import SelectionPanel from "@/components/SelectionPanel";
import AIGenerator from "@/components/AIGenerator";
import { useVoxelStore } from "@/lib/store";

const VoxelCanvas = dynamic(() => import("@/components/VoxelCanvas"), {
  ssr: false,
});

function AIOverlay() {
  const show = useVoxelStore((s) => s.showAIPanel);
  if (!show) return null;
  return <AIGenerator />;
}

export default function Home() {
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden" style={{ background: "#1a1a1a" }}>
      <div className="flex flex-1 overflow-hidden">
        <Toolbar />
        <div
          className="flex-1 h-full relative"
          onContextMenu={(e) => e.preventDefault()}
        >
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-gray-400" style={{ background: "#1a1a1a" }}>
                Loading 3D editor...
              </div>
            }
          >
            <VoxelCanvas />
          </Suspense>
          <SelectionPanel />
          <AIOverlay />
        </div>
        <ColorPalette />
      </div>
      <StatusBar />
    </div>
  );
}
