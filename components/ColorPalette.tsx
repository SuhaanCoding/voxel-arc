"use client";

import { useVoxelStore } from "@/lib/store";
import { COLOR_PALETTE } from "@/lib/constants";

export default function ColorPalette() {
  const activeColor = useVoxelStore((s) => s.activeColor);
  const setActiveColor = useVoxelStore((s) => s.setActiveColor);

  return (
    <div
      className="h-full overflow-y-auto overflow-x-hidden flex flex-col items-center py-4 gap-[6px] select-none shrink-0 border-l custom-scrollbar"
      style={{ background: "#111116", width: 64, borderColor: "#2a2a35" }}
    >
      {/* Active Color Preview */}
      <div className="mb-2 flex justify-center">
        <div
          className="rounded-lg transition-all duration-200 ease-out"
          style={{
            backgroundColor: activeColor,
            width: 36,
            height: 36,
            border: "2px solid #444455",
            boxShadow: `0 0 16px ${activeColor}44`
          }}
          title="Current Color"
        />
      </div>

      <div className="w-[32px] h-[1px] bg-[#2a2a35] mb-2" />

      {/* Color swatches */}
      {COLOR_PALETTE.map((color) => {
        const isActive = activeColor === color;
        return (
          <button
            key={color}
            onClick={() => setActiveColor(color)}
            title={color}
            className="rounded-md transition-all duration-150 ease-out relative"
            style={{
              backgroundColor: color,
              width: 30,
              height: 30,
              flexShrink: 0,
              transform: isActive ? "scale(1.1)" : "scale(1)",
              border: isActive ? "2px solid white" : "1px solid #2a2a35",
              boxShadow: isActive ? `0 0 12px ${color}66` : "none",
              zIndex: isActive ? 10 : 1
            }}
          />
        );
      })}
    </div>
  );
}
