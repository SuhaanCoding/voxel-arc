"use client";

import { useVoxelStore, parseKey } from "@/lib/store";

export default function SelectionPanel() {
  const selectedVoxels = useVoxelStore((s) => s.selectedVoxels);
  const voxels = useVoxelStore((s) => s.voxels);
  const paintSelected = useVoxelStore((s) => s.paintSelected);
  const deleteSelected = useVoxelStore((s) => s.deleteSelected);
  const deselectAll = useVoxelStore((s) => s.deselectAll);

  if (selectedVoxels.size === 0) return null;

  // Get colors of selected voxels
  const colors = new Set<string>();
  for (const key of selectedVoxels) {
    const color = voxels.get(key);
    if (color) colors.add(color);
  }
  const isMixed = colors.size > 1;
  const currentColor = isMixed ? "#888888" : (colors.values().next().value ?? "#888888");

  // Position info (show if single voxel selected)
  let positionInfo: string | null = null;
  if (selectedVoxels.size === 1) {
    const key = selectedVoxels.values().next().value;
    if (key) {
      const [x, y, z] = parseKey(key);
      positionInfo = `(${x}, ${y}, ${z})`;
    }
  }

  return (
    <div
      className="absolute bottom-8 right-16 rounded-lg shadow-lg p-3 flex flex-col gap-2 select-none z-10"
      style={{ background: "#2a2a2a", width: 160, color: "#e0e0e0" }}
    >
      <div className="text-xs font-bold text-gray-400 uppercase">Selection</div>

      <div className="text-sm">
        {selectedVoxels.size} voxel{selectedVoxels.size !== 1 ? "s" : ""}
      </div>

      {positionInfo && (
        <div className="text-xs text-gray-500">Position: {positionInfo}</div>
      )}

      {/* Color */}
      <div className="flex items-center gap-2">
        <div
          className="w-6 h-6 rounded border border-gray-600"
          style={{ backgroundColor: currentColor }}
        />
        <span className="text-xs text-gray-400">{isMixed ? "Mixed" : currentColor}</span>
      </div>

      {/* Repaint */}
      <label className="text-xs text-gray-400">
        Repaint
        <input
          type="color"
          value={currentColor}
          onChange={(e) => paintSelected(e.target.value)}
          className="block w-full h-7 mt-1 rounded cursor-pointer border-0 bg-transparent"
        />
      </label>

      {/* Actions */}
      <div className="flex gap-1 mt-1">
        <button
          onClick={deleteSelected}
          className="flex-1 px-2 py-1.5 rounded text-xs bg-red-900 hover:bg-red-700 text-white transition-colors"
        >
          Delete
        </button>
        <button
          onClick={deselectAll}
          className="flex-1 px-2 py-1.5 rounded text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
        >
          Deselect
        </button>
      </div>

      <div className="text-[10px] text-gray-600 mt-1">
        Backspace to delete | Esc to deselect | Drag to move | Shift+click for multi
      </div>
    </div>
  );
}
