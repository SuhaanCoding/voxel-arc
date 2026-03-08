"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import Toolbar from "@/components/Toolbar";
import ColorPalette from "@/components/ColorPalette";
import StatusBar from "@/components/StatusBar";
import SelectionPanel from "@/components/SelectionPanel";
import AIGenerator from "@/components/AIGenerator";
import HelpOverlay from "@/components/HelpOverlay";
import { useVoxelStore } from "@/lib/store";

const VoxelCanvas = dynamic(() => import("@/components/VoxelCanvas"), {
  ssr: false,
});

function AIOverlay() {
  const show = useVoxelStore((s) => s.showAIPanel);
  if (!show) return null;
  return <AIGenerator />;
}

function HelpOverlayWrapper() {
  const show = useVoxelStore((s) => s.showHelp);
  if (!show) return null;
  return <HelpOverlay />;
}

function ModeIndicator() {
  const activeMode = useVoxelStore((s) => s.activeMode);
  const activeBrush = useVoxelStore((s) => s.activeBrush);

  let label: string;
  let hint: string;

  if (activeMode === "attach") {
    if (activeBrush === "voxel") {
      label = "Place";
      hint = "Click a surface to add a single voxel";
    } else if (activeBrush === "box") {
      label = "Box Fill";
      hint = "Drag across a surface to fill a volume";
    } else {
      label = "Face Extrude";
      hint = "Click a face to push out the matching surface";
    }
  } else {
    label = "Select";
    hint = "Click to select · Shift+click to multi-select · Drag to move · Del to remove";
  }

  return (
    <div className="absolute top-4 left-4 pointer-events-none z-10 flex items-center gap-3">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: "#22222d", border: "1px solid #2a2a35" }}>
        <div className="w-2 h-2 rounded-full" style={{ background: "#3b82f6" }} />
        <span className="text-sm font-medium text-[#e2e2e8]">{label}</span>
      </div>
      <span className="text-xs font-mono text-[#505060]">{hint}</span>
    </div>
  );
}

export default function Home() {
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden" style={{ background: "#111116" }}>
      <div className="flex flex-1 overflow-hidden relative">
        <Toolbar />
        <div
          className="flex-1 h-full relative"
          onContextMenu={(e) => e.preventDefault()}
        >
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-gray-400" style={{ background: "#111116" }}>
                Loading 3D editor...
              </div>
            }
          >
            <VoxelCanvas />
          </Suspense>
          <ModeIndicator />
          <SelectionPanel />
          <AIOverlay />
          <HelpOverlayWrapper />

          {/* Viewport Overlay — Legend Text */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none text-[#505060] font-mono text-[11px] bg-[#111116]/80 px-4 py-1.5 rounded-full backdrop-blur-sm border border-[#2a2a35]/50">
            Press H for controls
          </div>

        </div>
        <ColorPalette />
      </div>
      <StatusBar />
    </div>
  );
}
