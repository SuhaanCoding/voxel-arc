"use client";

import { useVoxelStore } from "@/lib/store";
import { downloadScene } from "@/lib/exportScene";

export default function TopBar() {
    const activeMode = useVoxelStore((s) => s.activeMode);
    const activeBrush = useVoxelStore((s) => s.activeBrush);
    const toggleAIPanel = useVoxelStore((s) => s.toggleAIPanel);

    let modeName = "Unknown";
    if (activeMode === "attach") {
        modeName = activeBrush === "voxel" ? "Append voxels" : activeBrush === "box" ? "Box Fill" : "Face Extrude";
    } else if (activeMode === "select") {
        modeName = "Select Mode";
    }

    return (
        <div className="w-full flex justify-center pointer-events-none z-10">
            <div className="pointer-events-auto flex items-center justify-between gap-12 px-6 py-2 w-fit" style={{ background: "#18181f", borderBottom: "1px solid #2a2a35" }}>

                {/* Left: Mode Indicator */}
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: "#22222d" }}>
                        <div className="w-2 h-2 rounded-full" style={{ background: "#3b82f6" }}></div>
                        <span className="text-sm font-medium text-[#e2e2e8]">Mode: {modeName}</span>
                    </div>
                    <span className="text-xs font-mono text-[#505060]">
                        {activeMode === "attach" ? "Click to place · Right-click to erase" : "Click to select · Shift+Click multi-select"}
                    </span>
                </div>

                {/* Center: Project info */}
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[#e2e2e8]">Untitled Project</span>
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded text-[#808090]" style={{ background: "#22222d" }}>Saved</span>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => downloadScene(useVoxelStore.getState().voxels)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors hover:text-white"
                        style={{ border: "1px solid #2a2a35", color: "#a0a0b0", background: "transparent" }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" x2="12" y1="15" y2="3" />
                        </svg>
                        Export
                    </button>
                </div>

            </div>
        </div>
    );
}
