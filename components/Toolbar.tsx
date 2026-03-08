"use client";

import { useEffect, useRef } from "react";
import { useVoxelStore } from "@/lib/store";
import { downloadScene, parseSceneJSON } from "@/lib/exportScene";

interface IconButtonProps {
  label: string;
  active?: boolean;
  onClick: () => void;
  title: string;
}

function IconButton({ label, active, onClick, title }: IconButtonProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-9 h-9 rounded text-xs font-bold transition-colors flex items-center justify-center ${
        active
          ? "bg-blue-500 text-white"
          : "text-gray-400 hover:bg-gray-700 hover:text-white"
      }`}
      style={{ background: active ? "#3b82f6" : undefined }}
    >
      {label}
    </button>
  );
}

function Divider() {
  return <div className="w-8 border-t border-gray-600 my-1" />;
}

export default function Toolbar() {
  const activeMode = useVoxelStore((s) => s.activeMode);
  const activeBrush = useVoxelStore((s) => s.activeBrush);
  const mirrorAxes = useVoxelStore((s) => s.mirrorAxes);
  const setActiveMode = useVoxelStore((s) => s.setActiveMode);
  const setActiveBrush = useVoxelStore((s) => s.setActiveBrush);
  const setMirrorAxis = useVoxelStore((s) => s.setMirrorAxis);
  const showWireframe = useVoxelStore((s) => s.showWireframe);
  const toggleWireframe = useVoxelStore((s) => s.toggleWireframe);
  const undo = useVoxelStore((s) => s.undo);
  const redo = useVoxelStore((s) => s.redo);
  const clearScene = useVoxelStore((s) => s.clearScene);
  const deleteSelected = useVoxelStore((s) => s.deleteSelected);
  const deselectAll = useVoxelStore((s) => s.deselectAll);
  const toggleAIPanel = useVoxelStore((s) => s.toggleAIPanel);
  const loadScene = useVoxelStore((s) => s.loadScene);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        downloadScene(useVoxelStore.getState().voxels);
        return;
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "z") {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "z") {
        e.preventDefault();
        redo();
      } else {
        switch (e.key.toLowerCase()) {
          case "t": setActiveMode("attach"); break;
          case "s": setActiveMode("select"); break;
          case "v": setActiveBrush("voxel"); break;
          case "b": setActiveBrush("box"); break;
          case "f": setActiveBrush("face"); break;
          case "x": setMirrorAxis("x", !useVoxelStore.getState().mirrorAxes.x); break;
          case "y": setMirrorAxis("y", !useVoxelStore.getState().mirrorAxes.y); break;
          case "z": setMirrorAxis("z", !useVoxelStore.getState().mirrorAxes.z); break;
          case "w": toggleWireframe(); break;
          case "a": toggleAIPanel(); break;
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
  }, [undo, redo, setActiveMode, setActiveBrush, setMirrorAxis, toggleWireframe, deleteSelected, deselectAll, toggleAIPanel]);

  return (
    <div
      className="h-full flex flex-col items-center py-2 gap-1 select-none shrink-0"
      style={{ background: "#2a2a2a", width: 50 }}
    >
      {/* Modes */}
      <IconButton label="T" active={activeMode === "attach"} onClick={() => setActiveMode("attach")} title="Attach / Place (T)" />
      <IconButton label="S" active={activeMode === "select"} onClick={() => setActiveMode("select")} title="Select (S)" />

      <Divider />

      {/* Brush shapes */}
      <IconButton label="V" active={activeBrush === "voxel"} onClick={() => setActiveBrush("voxel")} title="Voxel brush (V)" />
      <IconButton label="B" active={activeBrush === "box"} onClick={() => setActiveBrush("box")} title="Box brush (B)" />
      <IconButton label="F" active={activeBrush === "face"} onClick={() => setActiveBrush("face")} title="Face brush (F)" />

      <Divider />

      {/* Mirror toggles */}
      <IconButton label="Mx" active={mirrorAxes.x} onClick={() => setMirrorAxis("x", !mirrorAxes.x)} title="Mirror X (X)" />
      <IconButton label="My" active={mirrorAxes.y} onClick={() => setMirrorAxis("y", !mirrorAxes.y)} title="Mirror Y (Y)" />
      <IconButton label="Mz" active={mirrorAxes.z} onClick={() => setMirrorAxis("z", !mirrorAxes.z)} title="Mirror Z (Z)" />

      <Divider />

      {/* View */}
      <IconButton label="W" active={showWireframe} onClick={toggleWireframe} title="Wireframe (W)" />

      <Divider />

      {/* Undo / Redo / Clear */}
      <IconButton label="↩" active={false} onClick={undo} title="Undo (Ctrl+Z)" />
      <IconButton label="↪" active={false} onClick={redo} title="Redo (Ctrl+Shift+Z)" />
      <IconButton label="✕" active={false} onClick={() => { if (window.confirm("Clear all voxels?")) clearScene(); }} title="Clear all" />

      <Divider />

      {/* Save / Load */}
      <IconButton label="💾" active={false} onClick={() => downloadScene(useVoxelStore.getState().voxels)} title="Save (Ctrl+S)" />
      <IconButton label="📂" active={false} onClick={() => fileInputRef.current?.click()} title="Load" />
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            try {
              const entries = parseSceneJSON(reader.result as string);
              loadScene(entries);
            } catch (err) {
              alert("Failed to load scene: " + (err instanceof Error ? err.message : "Invalid file"));
            }
          };
          reader.readAsText(file);
          e.target.value = "";
        }}
      />

      <Divider />

      {/* AI Generate */}
      <IconButton label="AI" active={false} onClick={toggleAIPanel} title="AI Generate (A)" />
    </div>
  );
}
