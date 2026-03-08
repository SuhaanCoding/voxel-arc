import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { enableMapSet } from "immer";
import { DEFAULT_COLOR, GRID_SIZE } from "./constants";

// CRITICAL: Must call before any Immer producer touches a Map/Set
enableMapSet();

export type VoxelKey = `${number},${number},${number}`;
export type HexColor = string;

export type VoxelCommand =
  | { type: "PLACE"; key: VoxelKey; color: HexColor }
  | { type: "REMOVE"; key: VoxelKey; previousColor: HexColor }
  | { type: "PAINT"; key: VoxelKey; previousColor: HexColor; newColor: HexColor }
  | { type: "BATCH"; commands: VoxelCommand[] };

interface VoxelStore {
  voxels: Map<VoxelKey, HexColor>;
  gridSize: number;
  activeColor: HexColor;
  activeMode: "attach" | "select";
  activeBrush: "voxel" | "box" | "face";
  mirrorAxes: { x: boolean; y: boolean; z: boolean };
  showWireframe: boolean;
  showAIPanel: boolean;
  showHelp: boolean;
  selectedVoxels: Set<VoxelKey>;
  undoStack: VoxelCommand[];
  redoStack: VoxelCommand[];

  placeVoxel: (key: VoxelKey, color: HexColor) => void;
  removeVoxel: (key: VoxelKey) => void;
  paintVoxel: (key: VoxelKey, color: HexColor) => void;
  executeBatch: (commands: VoxelCommand[]) => void;
  setActiveColor: (color: HexColor) => void;
  setActiveMode: (mode: "attach" | "select") => void;
  setActiveBrush: (brush: "voxel" | "box" | "face") => void;
  setMirrorAxis: (axis: "x" | "y" | "z", value: boolean) => void;
  setGridSize: (size: number) => void;
  toggleWireframe: () => void;
  toggleAIPanel: () => void;
  toggleHelp: () => void;

  selectVoxel: (key: VoxelKey, additive: boolean) => void;
  deselectAll: () => void;
  deleteSelected: () => void;
  paintSelected: (color: HexColor) => void;
  moveVoxels: (keys: VoxelKey[], offset: [number, number, number], replace: boolean) => void;

  undo: () => void;
  redo: () => void;
  loadScene: (entries: [VoxelKey, HexColor][]) => void;
  clearScene: () => void;
}

export const useVoxelStore = create(
  immer<VoxelStore>((set) => ({
    voxels: new Map(),
    gridSize: GRID_SIZE,
    activeColor: DEFAULT_COLOR,
    activeMode: "attach",
    activeBrush: "voxel",
    mirrorAxes: { x: false, y: false, z: false },
    showWireframe: false,
    showAIPanel: false,
    showHelp: false,
    selectedVoxels: new Set(),
    undoStack: [],
    redoStack: [],

    placeVoxel: (key, color) => {
      set((state) => {
        if (state.voxels.has(key)) return;
        state.voxels.set(key, color);
        state.undoStack.push({ type: "PLACE", key, color });
        state.redoStack = [];
      });
    },

    removeVoxel: (key) => {
      set((state) => {
        const prevColor = state.voxels.get(key);
        if (!prevColor) return;
        state.voxels.delete(key);
        state.undoStack.push({ type: "REMOVE", key, previousColor: prevColor });
        state.redoStack = [];
      });
    },

    paintVoxel: (key, color) => {
      set((state) => {
        const prevColor = state.voxels.get(key);
        if (!prevColor || prevColor === color) return;
        state.voxels.set(key, color);
        state.undoStack.push({ type: "PAINT", key, previousColor: prevColor, newColor: color });
        state.redoStack = [];
      });
    },

    executeBatch: (commands) => {
      set((state) => {
        for (const cmd of commands) {
          if (cmd.type === "PLACE") {
            if (!state.voxels.has(cmd.key)) state.voxels.set(cmd.key, cmd.color);
          } else if (cmd.type === "REMOVE") {
            state.voxels.delete(cmd.key);
          } else if (cmd.type === "PAINT") {
            if (state.voxels.has(cmd.key)) state.voxels.set(cmd.key, cmd.newColor);
          }
        }
        if (commands.length > 0) {
          state.undoStack.push({ type: "BATCH", commands });
          state.redoStack = [];
        }
      });
    },

    setActiveColor: (color) => {
      set((state) => { state.activeColor = color; });
    },

    setActiveMode: (mode) => {
      set((state) => {
        state.activeMode = mode;
        if (mode !== "select") state.selectedVoxels.clear();
      });
    },

    setActiveBrush: (brush) => {
      set((state) => { state.activeBrush = brush; });
    },

    setMirrorAxis: (axis, value) => set((state) => {
      state.mirrorAxes[axis] = value;
    }),
    setGridSize: (size) => set((state) => {
      // ONLY delete voxels if the grid is shrinking!
      if (size < state.gridSize) {
        const toDelete: VoxelKey[] = [];
        for (const [key] of state.voxels) {
          const [x, y, z] = parseKey(key);
          if (x >= size || y >= size || z >= size) toDelete.push(key);
        }
        toDelete.forEach(k => {
          state.voxels.delete(k);
          state.selectedVoxels.delete(k); // Also deselect if deleted
        });
      }
      state.gridSize = size;
    }),
    toggleWireframe: () => set((state) => {
      state.showWireframe = !state.showWireframe;
    }),

    toggleAIPanel: () => {
      set((state) => { state.showAIPanel = !state.showAIPanel; });
    },

    toggleHelp: () => {
      set((state) => { state.showHelp = !state.showHelp; });
    },

    selectVoxel: (key, additive) => {
      set((state) => {
        if (!state.voxels.has(key)) return;
        if (additive) {
          if (state.selectedVoxels.has(key)) {
            state.selectedVoxels.delete(key);
          } else {
            state.selectedVoxels.add(key);
          }
        } else {
          state.selectedVoxels.clear();
          state.selectedVoxels.add(key);
        }
      });
    },

    deselectAll: () => {
      set((state) => { state.selectedVoxels.clear(); });
    },

    deleteSelected: () => {
      set((state) => {
        if (state.selectedVoxels.size === 0) return;
        const commands: VoxelCommand[] = [];
        for (const key of state.selectedVoxels) {
          const prevColor = state.voxels.get(key);
          if (prevColor) {
            state.voxels.delete(key);
            commands.push({ type: "REMOVE", key, previousColor: prevColor });
          }
        }
        if (commands.length > 0) {
          state.undoStack.push({ type: "BATCH", commands });
          state.redoStack = [];
        }
        state.selectedVoxels.clear();
      });
    },

    paintSelected: (color) => {
      set((state) => {
        if (state.selectedVoxels.size === 0) return;
        const commands: VoxelCommand[] = [];
        for (const key of state.selectedVoxels) {
          const prevColor = state.voxels.get(key);
          if (prevColor && prevColor !== color) {
            state.voxels.set(key, color);
            commands.push({ type: "PAINT", key, previousColor: prevColor, newColor: color });
          }
        }
        if (commands.length > 0) {
          state.undoStack.push({ type: "BATCH", commands });
          state.redoStack = [];
        }
      });
    },

    moveVoxels: (keys, offset, replace) => {
      set((state) => {
        const [dx, dy, dz] = offset;
        if (dx === 0 && dy === 0 && dz === 0) return;

        // Compute new positions
        const moves: { oldKey: VoxelKey; newKey: VoxelKey; color: HexColor }[] = [];
        const newKeySet = new Set<VoxelKey>();
        const oldKeySet = new Set(keys);

        for (const oldKey of keys) {
          const color = state.voxels.get(oldKey);
          if (!color) continue;
          const [x, y, z] = oldKey.split(",").map(Number);
          const nx = x + dx, ny = y + dy, nz = z + dz;
          if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE || nz < 0 || nz >= GRID_SIZE) return;
          const newKey: VoxelKey = `${nx},${ny},${nz}`;
          newKeySet.add(newKey);
          moves.push({ oldKey, newKey, color });
        }

        // Check for conflicts (destination occupied by non-moving voxel)
        if (!replace) {
          for (const m of moves) {
            if (state.voxels.has(m.newKey) && !oldKeySet.has(m.newKey)) {
              return; // Revert — don't move
            }
          }
        }

        const commands: VoxelCommand[] = [];

        // Remove conflicting voxels at destination if replacing
        if (replace) {
          for (const m of moves) {
            if (state.voxels.has(m.newKey) && !oldKeySet.has(m.newKey)) {
              const prevColor = state.voxels.get(m.newKey)!;
              commands.push({ type: "REMOVE", key: m.newKey, previousColor: prevColor });
              state.voxels.delete(m.newKey);
            }
          }
        }

        // Remove from old positions
        for (const m of moves) {
          commands.push({ type: "REMOVE", key: m.oldKey, previousColor: m.color });
          state.voxels.delete(m.oldKey);
        }

        // Place at new positions
        for (const m of moves) {
          commands.push({ type: "PLACE", key: m.newKey, color: m.color });
          state.voxels.set(m.newKey, m.color);
        }

        if (commands.length > 0) {
          state.undoStack.push({ type: "BATCH", commands });
          state.redoStack = [];
        }

        // Update selection to new keys
        state.selectedVoxels.clear();
        for (const m of moves) {
          state.selectedVoxels.add(m.newKey);
        }
      });
    },

    undo: () => {
      set((state) => {
        const cmd = state.undoStack.pop();
        if (!cmd) return;
        if (cmd.type === "PLACE") {
          state.voxels.delete(cmd.key);
        } else if (cmd.type === "REMOVE") {
          state.voxels.set(cmd.key, cmd.previousColor);
        } else if (cmd.type === "PAINT") {
          state.voxels.set(cmd.key, cmd.previousColor);
        } else if (cmd.type === "BATCH") {
          for (const sub of [...cmd.commands].reverse()) {
            if (sub.type === "PLACE") state.voxels.delete(sub.key);
            else if (sub.type === "REMOVE") state.voxels.set(sub.key, sub.previousColor);
            else if (sub.type === "PAINT") state.voxels.set(sub.key, sub.previousColor);
          }
        }
        state.redoStack.push(cmd);
      });
    },

    redo: () => {
      set((state) => {
        const cmd = state.redoStack.pop();
        if (!cmd) return;
        if (cmd.type === "PLACE") {
          state.voxels.set(cmd.key, cmd.color);
        } else if (cmd.type === "REMOVE") {
          state.voxels.delete(cmd.key);
        } else if (cmd.type === "PAINT") {
          state.voxels.set(cmd.key, cmd.newColor);
        } else if (cmd.type === "BATCH") {
          for (const sub of cmd.commands) {
            if (sub.type === "PLACE") state.voxels.set(sub.key, sub.color);
            else if (sub.type === "REMOVE") state.voxels.delete(sub.key);
            else if (sub.type === "PAINT") state.voxels.set(sub.key, sub.newColor);
          }
        }
        state.undoStack.push(cmd);
      });
    },

    loadScene: (entries) => {
      set((state) => {
        const commands: VoxelCommand[] = [];
        for (const [key, color] of state.voxels) {
          commands.push({ type: "REMOVE", key, previousColor: color });
        }
        for (const [key, color] of entries) {
          commands.push({ type: "PLACE", key, color });
        }
        if (commands.length > 0) {
          state.undoStack.push({ type: "BATCH", commands });
          state.redoStack = [];
        }
        state.voxels.clear();
        for (const [key, color] of entries) {
          state.voxels.set(key, color);
        }
        state.selectedVoxels.clear();
      });
    },

    clearScene: () => {
      set((state) => {
        if (state.voxels.size === 0) return;
        const commands: VoxelCommand[] = [];
        for (const [key, color] of state.voxels) {
          commands.push({ type: "REMOVE", key, previousColor: color });
        }
        state.undoStack.push({ type: "BATCH", commands });
        state.redoStack = [];
        state.voxels.clear();
        state.selectedVoxels.clear();
      });
    },
  })),
);

export function parseKey(key: VoxelKey): [number, number, number] {
  const parts = key.split(",").map(Number);
  return [parts[0], parts[1], parts[2]];
}

export function toKey(x: number, y: number, z: number): VoxelKey {
  return `${x},${y},${z}`;
}
