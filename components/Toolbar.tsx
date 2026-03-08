"use client";

import { useEffect, useRef } from "react";
import { useVoxelStore } from "@/lib/store";
import { parseSceneJSON, downloadScene } from "@/lib/exportScene";

const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
const modKey = isMac ? "⌘" : "Ctrl+";

interface IconButtonProps {
  icon: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  label: string;
  shortcut?: string;
}

function IconButton({ icon, active, onClick, label, shortcut }: IconButtonProps) {
  return (
    <div className="relative group">
      <button
        onClick={onClick}
        className={`w-[38px] h-[38px] rounded-lg transition-all flex items-center justify-center ${active
          ? "bg-[#3b82f6] text-white"
          : "text-[#808090] hover:bg-[#22222d] hover:text-[#e2e2e8]"
          }`}
      >
        {icon}
      </button>

      {/* Tooltip */}
      <div className="absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-[#22222d] border border-[#2a2a35] shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 flex items-center gap-2">
        <span className="text-sm font-medium text-[#e2e2e8]">{label}</span>
        {shortcut && (
          <span className="text-[10px] font-mono text-[#a0a0b0] bg-[#111116] border border-[#2a2a35] rounded px-1.5 py-0.5">
            {shortcut}
          </span>
        )}
      </div>
    </div>
  );
}

function Divider() {
  return <div className="w-[24px] h-[1px] bg-[#2a2a35] my-[4px]" />;
}

export default function Toolbar() {
  const activeMode = useVoxelStore((s) => s.activeMode);
  const activeBrush = useVoxelStore((s) => s.activeBrush);
  const mirrorAxes = useVoxelStore((s) => s.mirrorAxes);
  const showWireframe = useVoxelStore((s) => s.showWireframe);

  const setActiveMode = useVoxelStore((s) => s.setActiveMode);
  const setActiveBrush = useVoxelStore((s) => s.setActiveBrush);
  const setMirrorAxis = useVoxelStore((s) => s.setMirrorAxis);
  const toggleWireframe = useVoxelStore((s) => s.toggleWireframe);
  const undo = useVoxelStore((s) => s.undo);
  const redo = useVoxelStore((s) => s.redo);
  const clearScene = useVoxelStore((s) => s.clearScene);
  const deleteSelected = useVoxelStore((s) => s.deleteSelected);
  const deselectAll = useVoxelStore((s) => s.deselectAll);
  const loadScene = useVoxelStore((s) => s.loadScene);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const entries = parseSceneJSON(reader.result as string);
        loadScene(entries);
      } catch (err) {
        alert("Failed to import scene: " + (err instanceof Error ? err.message : "Invalid file"));
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "z") {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "z") {
        e.preventDefault();
        redo();
      } else {
        switch (e.key.toLowerCase()) {
          case "q": setActiveMode("attach"); break;
          case "s": setActiveMode("select"); break;
          case "v": setActiveBrush("voxel"); break;
          case "b": setActiveBrush("box"); break;
          case "f": setActiveBrush("face"); break;
          case "x": setMirrorAxis("x", !useVoxelStore.getState().mirrorAxes.x); break;
          case "y": setMirrorAxis("y", !useVoxelStore.getState().mirrorAxes.y); break;
          case "z": setMirrorAxis("z", !useVoxelStore.getState().mirrorAxes.z); break;
          case "w": toggleWireframe(); break;
          case "h":
          case "?": useVoxelStore.getState().toggleHelp(); break;
        }
        if (e.key === "Backspace" || e.key === "Delete") {
          e.preventDefault();
          deleteSelected();
        }
        if (e.key === "Escape") {
          deselectAll();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo, setActiveMode, setActiveBrush, setMirrorAxis, toggleWireframe, deleteSelected, deselectAll]);

  return (
    <div
      className="h-full flex flex-col items-center py-4 gap-[4px] select-none shrink-0 border-r"
      style={{ background: "#111116", width: 56, borderColor: "#2a2a35" }}
    >
      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Group 1: Modes & Brushes */}
      <IconButton
        label="Place"
        shortcut="Q"
        active={activeMode === "attach"}
        onClick={() => setActiveMode("attach")}
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><line x1="12" y1="6" x2="12" y2="12" /><line x1="9" y1="9" x2="15" y2="9" /></svg>}
      />
      <IconButton
        label="Select"
        shortcut="S"
        active={activeMode === "select"}
        onClick={() => setActiveMode("select")}
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z" /><path d="m13 13 6 6" /></svg>}
      />
      <IconButton
        label="Voxel Brush"
        shortcut="V"
        active={activeBrush === "voxel"}
        onClick={() => setActiveBrush("voxel")}
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l8 4v8l-8 4-8-4V6l8-4z" /><path d="M12 22v-8" /><path d="M12 14 4 10" /><path d="M12 14l8-4" /></svg>}
      />
      <IconButton
        label="Box Brush"
        shortcut="B"
        active={activeBrush === "box"}
        onClick={() => setActiveBrush("box")}
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /></svg>}
      />
      <IconButton
        label="Face Extrude"
        shortcut="F"
        active={activeBrush === "face"}
        onClick={() => setActiveBrush("face")}
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="14" height="12" rx="1" /><path d="M17 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10" /><path d="M19 12h2" /><path d="M20 10l2 2-2 2" /></svg>}
      />

      <Divider />

      {/* Group 2: Mirrors */}
      <IconButton
        label="Mirror X"
        shortcut="X"
        active={mirrorAxes.x}
        onClick={() => setMirrorAxis("x", !mirrorAxes.x)}
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v18" /><polyline points="8 16 4 12 8 8" /><polyline points="16 8 20 12 16 16" /></svg>}
      />
      <IconButton
        label="Mirror Y"
        shortcut="Y"
        active={mirrorAxes.y}
        onClick={() => setMirrorAxis("y", !mirrorAxes.y)}
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h18" /><polyline points="16 8 12 4 8 8" /><polyline points="8 16 12 20 16 16" /></svg>}
      />
      <IconButton
        label="Mirror Z"
        shortcut="Z"
        active={mirrorAxes.z}
        onClick={() => setMirrorAxis("z", !mirrorAxes.z)}
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 19L19 5" strokeDasharray="4 4" /><path d="M6 5 L5 5 L5 6" /><path d="M18 19 L19 19 L19 18" /></svg>}
      />

      <Divider />

      {/* Group 3: Global Actions */}
      <IconButton
        label="Wireframe"
        shortcut="W"
        active={showWireframe}
        onClick={toggleWireframe}
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2.6 16.4l4.2-2.1m10.4-5.2l4.2-2.1" /><path d="M2.6 7.6l4.2 2.1m10.4 5.2l4.2 2.1" /><path d="M12 2v6m0 8v6" /><path d="M2 17l10 5 10-5" /><path d="M2 7l10 5 10-5" /><path d="M2 7l10-5 10 5" /><path d="M12 12L2 7" /><path d="M12 12l10-5" /></svg>}
      />
      <IconButton
        label="Undo"
        shortcut={`${modKey}Z`}
        active={false}
        onClick={undo}
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" /></svg>}
      />
      <IconButton
        label="Redo"
        shortcut={`${modKey}${isMac ? "⇧" : "Shift+"}Z`}
        active={false}
        onClick={redo}
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" /></svg>}
      />

      <Divider />

      <IconButton
        label="AI Generate"
        active={useVoxelStore((s) => s.showAIPanel)}
        onClick={() => useVoxelStore.getState().toggleAIPanel()}
        icon={
          <div className="w-[30px] h-[18px] rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, #a855f7, #ec4899)" }}>
            <span className="text-[10px] font-bold text-white leading-none">AI</span>
          </div>
        }
      />
      <IconButton
        label="Import"
        active={false}
        onClick={handleImport}
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>}
      />
      <IconButton
        label="Export"
        active={false}
        onClick={() => downloadScene(useVoxelStore.getState().voxels)}
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>}
      />
      <IconButton
        label="Clear All"
        active={false}
        onClick={() => { if (window.confirm("Clear all voxels?")) clearScene(); }}
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>}
      />

      <Divider />

      <IconButton
        label="Help"
        shortcut="H"
        active={useVoxelStore((s) => s.showHelp)}
        onClick={() => useVoxelStore.getState().toggleHelp()}
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>}
      />
    </div>
  );
}
