"use client";

import { useVoxelStore } from "@/lib/store";

const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
const mod = isMac ? "\u2318" : "Ctrl";

const mouseControls = [
  ["LMB", "Active tool"],
  ["RMB", "Orbit / Rotate"],
  ["Shift + RMB", "Pan"],
  ["MMB", "Pan"],
  ["Scroll", "Zoom"],
  ["Shift + drag", "Vertical (box brush)"],
];

const keyboardShortcuts = [
  ["Q", "Place mode"],
  ["S", "Select mode"],
  ["V", "Voxel brush"],
  ["B", "Box brush"],
  ["F", "Face brush"],
  ["X / Y / Z", "Mirror toggles"],
  ["W", "Wireframe"],
  [`${mod}+Z`, "Undo"],
  [`${mod}+Shift+Z`, "Redo"],
  ["Del", "Delete selected"],
  ["Esc", "Deselect"],
  ["H", "Toggle this help"],
];

export default function HelpOverlay() {
  const toggleHelp = useVoxelStore((s) => s.toggleHelp);

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      onClick={toggleHelp}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Panel */}
      <div
        className="relative rounded-xl border shadow-2xl px-8 py-6 max-w-lg w-full mx-4"
        style={{ background: "#22222d", borderColor: "#2a2a35" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-[#e2e2e8]">Controls</h2>
          <button
            onClick={toggleHelp}
            className="w-7 h-7 rounded-md flex items-center justify-center text-[#808090] hover:text-[#e2e2e8] hover:bg-[#333340] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {/* Two columns */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-0">
          {/* Mouse */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[#808090] mb-2 font-semibold">Mouse</div>
            {mouseControls.map(([key, desc]) => (
              <div key={key} className="flex items-center gap-2 mb-1.5">
                <kbd className="text-[10px] font-mono text-[#a0a0b0] bg-[#111116] border border-[#2a2a35] rounded px-1.5 py-0.5 min-w-[60px] text-center">
                  {key}
                </kbd>
                <span className="text-xs text-[#808090]">{desc}</span>
              </div>
            ))}
          </div>

          {/* Keyboard */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[#808090] mb-2 font-semibold">Keyboard</div>
            {keyboardShortcuts.map(([key, desc]) => (
              <div key={key} className="flex items-center gap-2 mb-1.5">
                <kbd className="text-[10px] font-mono text-[#a0a0b0] bg-[#111116] border border-[#2a2a35] rounded px-1.5 py-0.5 min-w-[60px] text-center">
                  {key}
                </kbd>
                <span className="text-xs text-[#808090]">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
