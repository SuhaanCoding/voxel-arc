"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useVoxelStore, toKey, VoxelKey } from "@/lib/store";

function randomHexColor(): string {
  const r = Math.floor(Math.random() * 256);
  const g = Math.floor(Math.random() * 256);
  const b = Math.floor(Math.random() * 256);
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

export default function StatusBar() {
  const voxelCount = useVoxelStore((s) => s.voxels.size);
  const gridSize = useVoxelStore((s) => s.gridSize);
  const setGridSize = useVoxelStore((s) => s.setGridSize);
  const [fillCount, setFillCount] = useState(1000);
  const [churnRate, setChurnRate] = useState(0); // ops per tick (0 = off)
  const [fps, setFps] = useState(0);
  const framesRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const churnRef = useRef(0);

  // Keep churnRef in sync
  useEffect(() => { churnRef.current = churnRate; }, [churnRate]);

  // FPS counter — updates every 250ms for snappier readout
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

  // Stress test churn loop — adds and removes random voxels every frame
  useEffect(() => {
    let rafId: number;
    const churnTick = () => {
      const rate = churnRef.current;
      if (rate > 0) {
        const store = useVoxelStore.getState();
        const voxels = store.voxels;
        const keys = Array.from(voxels.keys());

        // Build a new map: copy existing, remove some, add some
        const newMap = new Map(voxels);

        // Delete ~half the rate worth of random existing voxels
        const toRemove = Math.min(Math.floor(rate / 2), keys.length);
        for (let i = 0; i < toRemove; i++) {
          const idx = Math.floor(Math.random() * keys.length);
          newMap.delete(keys[idx]);
          keys[idx] = keys[keys.length - 1];
          keys.pop();
        }

        // Add ~half the rate worth of new random voxels
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
  }, [gridSize]); // Added gridSize to dependencies for churnTick

  const handleRandomFill = useCallback(() => {
    // 1. Calculate max voxels based on current grid size
    const maxVoxels = gridSize * gridSize * gridSize;
    const requested = Math.min(fillCount, maxVoxels);
    if (requested <= 0) return;

    // 2. Generate positions within current bounds
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
  }, [fillCount, gridSize]); // Added gridSize to dependencies

  const clampFillCount = (val: number) => {
    const maxVoxels = gridSize * gridSize * gridSize;
    setFillCount(Math.max(1, Math.min(val, maxVoxels)));
  };

  const handleClear = useCallback(() => {
    useVoxelStore.getState().clearScene();
  }, []);

  const maxVoxels = gridSize * gridSize * gridSize;

  return (
    <div className="absolute bottom-4 left-4 right-4 bg-gray-900/90 text-white p-3 rounded-lg shadow-xl backdrop-blur-md flex flex-wrap items-center justify-between gap-4 border border-gray-700 pointer-events-auto">
      <div className="flex items-center space-x-4">
        <div className="font-mono text-sm px-3 py-1 bg-gray-800 rounded">
          {voxelCount.toLocaleString()} voxels
        </div>
        <div className="text-gray-400 text-sm">
          {gridSize}&times;{gridSize}&times;{gridSize}
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span
          style={{ color: fps >= 50 ? "#4ade80" : fps >= 30 ? "#facc15" : "#ef4444", fontWeight: "bold", minWidth: 52 }}
        >
          {fps} FPS
        </span>

        {/* Random fill */}
        <input
          type="range"
          min={100}
          max={Math.min(maxVoxels, 125000)}
          step={100}
          value={fillCount}
          onChange={(e) => clampFillCount(Number(e.target.value))}
          className="w-20 h-1 cursor-pointer"
          style={{ accentColor: "#3b82f6" }}
        />
        <span className="w-14 text-right">{fillCount.toLocaleString()}</span>
        <button
          onClick={handleRandomFill}
          className="px-2 py-0.5 rounded text-[10px] bg-blue-600 hover:bg-blue-500 text-white transition-colors"
        >
          Fill
        </button>
        <button
          onClick={handleClear}
          className="px-2 py-0.5 rounded text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
        >
          Clear
        </button>

        {/* Stress test churn */}
        <div className="w-px h-6 bg-gray-700 mx-2" />

        <div className="flex items-center space-x-2">
          <label className="text-xs text-gray-400 w-16 text-right cursor-help" title="Grid Size">
            Grid
          </label>
          <input
            title="Grid Size"
            type="range"
            min="10"
            max="100"
            step="10"
            value={gridSize}
            onChange={(e) => setGridSize(parseInt(e.target.value))}
            className="w-24 accent-blue-500"
          />
          <span className="text-xs font-mono w-8">{gridSize}</span>
        </div>
        <span className="text-gray-500">Stress</span>
        <input
          type="range"
          min={0}
          max={500}
          step={10}
          value={churnRate}
          onChange={(e) => setChurnRate(Number(e.target.value))}
          className="w-20 h-1 cursor-pointer"
          style={{ accentColor: churnRate > 0 ? "#ef4444" : "#3b82f6" }}
        />
        <span className="w-10 text-right" style={{ color: churnRate > 0 ? "#ef4444" : "#888" }}>
          {churnRate}/f
        </span>
      </div>
    </div>
  );
}
