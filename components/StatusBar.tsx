"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useVoxelStore, toKey, VoxelKey } from "@/lib/store";
import { randomHexColor } from "@/lib/constants";

export default function StatusBar() {
  const voxelCount = useVoxelStore((s) => s.voxels.size);
  const gridSize = useVoxelStore((s) => s.gridSize);
  const setStoreGridSize = useVoxelStore((s) => s.setGridSize);
  const [localGridSize, setLocalGridSize] = useState(gridSize);

  useEffect(() => { setLocalGridSize(gridSize); }, [gridSize]);
  const [fillCount, setFillCount] = useState(1000);
  const [churnRate, setChurnRate] = useState(0);
  const [fps, setFps] = useState(0);
  const framesRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const churnRef = useRef(0);

  useEffect(() => { churnRef.current = churnRate; }, [churnRate]);

  // FPS counter
  useEffect(() => {
    let rafId: number;
    const tick = () => {
      framesRef.current++;
      const now = performance.now();
      const elapsed = now - lastTimeRef.current;
      if (elapsed >= 250) {
        setFps(Math.round(framesRef.current / (elapsed / 1000)));
        framesRef.current = 0;
        lastTimeRef.current = now;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Stress test churn loop
  useEffect(() => {
    let rafId: number;
    const churnTick = () => {
      const rate = churnRef.current;
      if (rate > 0) {
        const store = useVoxelStore.getState();
        const voxels = store.voxels;
        const keys = Array.from(voxels.keys());

        const newMap = new Map(voxels);
        const toRemove = Math.min(Math.floor(rate / 2), keys.length);
        for (let i = 0; i < toRemove; i++) {
          const idx = Math.floor(Math.random() * keys.length);
          newMap.delete(keys[idx]);
          keys[idx] = keys[keys.length - 1];
          keys.pop();
        }

        const toAdd = Math.ceil(rate / 2);
        for (let i = 0; i < toAdd; i++) {
          const x = Math.floor(Math.random() * gridSize);
          const y = Math.floor(Math.random() * gridSize);
          const z = Math.floor(Math.random() * gridSize);
          newMap.set(toKey(x, y, z), randomHexColor());
        }

        useVoxelStore.setState({ voxels: newMap });
      }
      rafId = requestAnimationFrame(churnTick);
    };
    rafId = requestAnimationFrame(churnTick);
    return () => cancelAnimationFrame(rafId);
  }, [gridSize]);

  const handleRandomFill = useCallback(() => {
    const maxVoxels = gridSize * gridSize * gridSize;
    const requested = Math.min(fillCount, maxVoxels);
    if (requested <= 0) return;

    const positions = new Set<string>();
    while (positions.size < requested) {
      const x = Math.floor(Math.random() * gridSize);
      const y = Math.floor(Math.random() * gridSize);
      const z = Math.floor(Math.random() * gridSize);
      positions.add(`${x},${y},${z}`);
    }

    const entries: [VoxelKey, string][] = [];
    for (const pos of positions) {
      entries.push([pos as VoxelKey, randomHexColor()]);
    }

    useVoxelStore.getState().loadScene(entries);
  }, [fillCount, gridSize]);

  const clampFillCount = (val: number) => {
    const maxVoxels = gridSize * gridSize * gridSize;
    setFillCount(Math.max(1, Math.min(val, maxVoxels)));
  };

  const handleClear = useCallback(() => {
    useVoxelStore.getState().clearScene();
  }, []);

  const maxVoxels = gridSize * gridSize * gridSize;
  const isStressActive = churnRate > 0;

  const activeColor = useVoxelStore((s) => s.activeColor);
  const setActiveColor = useVoxelStore((s) => s.setActiveColor);

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center pointer-events-none z-10 font-mono">
      <div
        className="flex items-center gap-5 px-6 py-2.5 rounded-full shadow-2xl pointer-events-auto border border-[#2a2a35] transition-all"
        style={{ background: "#22222d" }}
      >

        {/* 1. Grid Slider */}
        <div className="flex items-center gap-4">
          <div className="flex flex-col text-[#808090] text-xs leading-none">
            <span>grid</span>
            <span>slider</span>
          </div>
          <input
            type="range"
            min="10"
            max="100"
            step="10"
            value={localGridSize}
            onChange={(e) => setLocalGridSize(Number(e.target.value))}
            onPointerUp={() => setStoreGridSize(localGridSize)}
            className="w-24 cursor-pointer"
            style={{ accentColor: "#e2e2e8" }}
          />
        </div>

        {/* 2. Dimensions */}
        <div className="text-[#e2e2e8] text-sm font-medium text-center shrink-0 w-[100px] tabular-nums">
          {gridSize}&times;{gridSize}&times;{gridSize}
        </div>

        {/* 3. Voxel Count — fixed width to prevent bar jitter */}
        <div className="flex flex-col text-[#e2e2e8] text-xs leading-none shrink-0 w-[40px]">
          <span className="font-medium text-sm tabular-nums">{voxelCount >= 1000 ? `${(voxelCount / 1000).toFixed(1)}k` : voxelCount}</span>
          <span className="text-[#808090]">voxels</span>
        </div>

        {/* Separator */}
        <div className="w-[1px] h-4 bg-[#3a3a48]"></div>

        {/* 4. Color Picker Swatch */}
        <div className="relative group flex items-center justify-center">
          <input
            type="color"
            value={activeColor}
            onChange={(e) => setActiveColor(e.target.value)}
            className="opacity-0 absolute inset-0 w-full h-full cursor-pointer z-10"
            title="Custom Color"
          />
          <div
            className="w-6 h-6 rounded-md transition-transform group-hover:scale-110 shadow-sm"
            style={{
              backgroundColor: activeColor,
              border: "2px solid #333340",
            }}
          ></div>
        </div>

        {/* Separator */}
        <div className="w-[1px] h-4 bg-[#3a3a48]"></div>

        {/* 5. Stress Test & FPS */}
        <div className="flex items-center gap-4 shrink-0">
          {/* Fixed width to prevent bar jitter from changing FPS digits */}
          <span style={{ color: fps >= 50 ? "#10b981" : fps >= 30 ? "#facc15" : "#ef4444", fontWeight: "600" }} className="text-sm shrink-0 w-[52px] tabular-nums">
            {fps} FPS
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setChurnRate(isStressActive ? 0 : 50)}
              className={`text-xs px-3 py-1 rounded-md border transition-colors shrink-0 text-center ${isStressActive
                ? "bg-[#3b1520] border-[#ef4444] text-[#ef4444] font-medium"
                : "bg-[#2a2a35] border-[#3a3a48] text-[#e2e2e8] hover:bg-[#333340] hover:text-white"
                }`}
            >
              {isStressActive ? "Stop" : "Stress test"}
            </button>
            {isStressActive && (
              <input
                type="range"
                min={10}
                max={500}
                step={10}
                value={churnRate}
                onChange={(e) => setChurnRate(Number(e.target.value))}
                className="w-16 cursor-pointer"
                style={{ accentColor: "#ef4444" }}
                title="Churn Rate"
              />
            )}
          </div>
        </div>

        {/* Separator */}
        <div className="w-[1px] h-4 bg-[#3a3a48]"></div>

        {/* 6. Fill / Clear */}
        <div className="flex items-center gap-3 shrink-0">
          <input
            type="range"
            min={100}
            max={Math.min(maxVoxels, 125000)}
            step={100}
            value={fillCount}
            onChange={(e) => clampFillCount(Number(e.target.value))}
            className="w-16 cursor-pointer"
            style={{ accentColor: "#e2e2e8" }}
            title="Fill Amount"
          />
          <span className="text-[#808090] text-sm shrink-0 text-right tabular-nums w-[36px]">
            {fillCount >= 1000 ? `${(fillCount / 1000).toFixed(0)}k` : fillCount}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRandomFill}
              className="text-xs px-3 py-1 rounded-md border bg-[#2a2a35] border-[#3a3a48] text-[#e2e2e8] hover:bg-[#333340] hover:text-white transition-colors"
            >
              Fill
            </button>
            <button
              onClick={handleClear}
              className="text-xs px-3 py-1 rounded-md border bg-[#2a2a35] border-[#3a3a48] text-[#808090] hover:bg-[#333340] hover:text-[#e2e2e8] transition-colors"
            >
              Clear
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
