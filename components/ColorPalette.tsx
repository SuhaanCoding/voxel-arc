"use client";

import { useVoxelStore } from "@/lib/store";
import { COLOR_PALETTE } from "@/lib/constants";

export default function ColorPalette() {
  const activeColor = useVoxelStore((s) => s.activeColor);
  const setActiveColor = useVoxelStore((s) => s.setActiveColor);

  return (
    <div
      className="h-full overflow-y-auto flex flex-col items-center py-2 gap-1 select-none"
      style={{ background: "#2a2a2a", width: 60 }}
    >
      {/* Color swatches */}
      {COLOR_PALETTE.map((color) => (
        <button
          key={color}
          onClick={() => setActiveColor(color)}
          title={color}
          style={{ backgroundColor: color, width: 40, height: 40, flexShrink: 0 }}
          className={`rounded transition-all ${activeColor === color
              ? "ring-2 ring-white ring-offset-1 ring-offset-[#2a2a2a]"
              : "hover:ring-1 hover:ring-gray-400"
            }`}
        />
      ))}
    </div>
  );
}
