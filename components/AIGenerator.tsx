"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useVoxelStore, VoxelKey, HexColor } from "@/lib/store";
import { voxelizeGLB } from "@/lib/voxelizeGLB";

type Stage = "idle" | "routing" | "processing" | "voxelizing" | "done";

const STAGE_LABELS: Record<Stage, string> = {
  idle: "",
  routing: "Analyzing prompt...",
  processing: "Fetching 3D model...",
  voxelizing: "Converting to voxels...",
  done: "Done!",
};

function PipelineIndicator({ stage, route }: { stage: Stage; route: string | null }) {
  const steps = ["Route", "Process", "Voxelize", "Done"];
  const stageIndex = { idle: -1, routing: 0, processing: 1, voxelizing: 2, done: 3 }[stage];

  return (
    <div className="flex items-center gap-1 text-[10px]">
      {steps.map((step, i) => (
        <div key={step} className="flex items-center gap-1">
          <div
            className="w-2 h-2 rounded-full"
            style={{
              background: i < stageIndex ? "#4ade80" : i === stageIndex ? "#3b82f6" : "#555",
            }}
          />
          <span style={{ color: i <= stageIndex ? "#e0e0e0" : "#666" }}>{step}</span>
          {i < steps.length - 1 && <span style={{ color: "#555" }}>→</span>}
        </div>
      ))}
      {route && <span className="ml-2 text-gray-500">[{route}]</span>}
    </div>
  );
}

export default function AIGenerator() {
  const [prompt, setPrompt] = useState("");
  const [routePref, setRoutePref] = useState<"AUTO" | "PROCEDURAL" | "SEARCH" | "GENERATE">("AUTO");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ route: string; reasoning: string } | null>(null);
  const [glbData, setGlbData] = useState<{ url: string; name: string } | null>(null);
  const [scale, setScale] = useState(0.8);
  const [voxelCount, setVoxelCount] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);
  const [pendingModel, setPendingModel] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadScene = useVoxelStore((s) => s.loadScene);
  const gridSize = useVoxelStore((s) => s.gridSize);
  const toggleAIPanel = useVoxelStore((s) => s.toggleAIPanel);

  // Poll HF task status
  useEffect(() => {
    if (!pendingTaskId || !pendingModel) return;

    let elapsed = 0;
    const interval = setInterval(async () => {
      elapsed += 5;
      if (elapsed > 120) {
        clearInterval(interval);
        setPendingTaskId(null);
        setPendingModel(null);
        setError("Generation timed out (>2 min). Try a simpler prompt.");
        setStage("idle");
        return;
      }

      try {
        const res = await fetch(`/api/generate/status?model=${encodeURIComponent(pendingModel)}&prompt=${encodeURIComponent(prompt)}`);
        const data = await res.json();

        if (data.status === "done" && data.url) {
          clearInterval(interval);
          setPendingTaskId(null);
          setPendingModel(null);
          setGlbData({ url: data.url, name: prompt });
          setStage("processing");
        } else if (data.status === "failed") {
          clearInterval(interval);
          setPendingTaskId(null);
          setPendingModel(null);
          setError(data.error || "3D generation failed");
          setStage("idle");
        }
      } catch {
        // Network error — keep polling
      }
    }, 5000);

    pollRef.current = interval;
    return () => clearInterval(interval);
  }, [pendingTaskId, pendingModel, prompt]);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || stage === "routing" || stage === "processing") return;
    setStage("routing");
    setError(null);
    setRouteInfo(null);
    setGlbData(null);
    setVoxelCount(0);
    setTruncated(false);

    try {
      // Modify prompt strictly client side with grid constraints
      const fullPrompt = `${prompt.trim()}\n\nIMPORTANT: The grid constraints are exactly: x=0 to ${gridSize - 1}, y=0 to ${gridSize - 1}, z=0 to ${gridSize - 1}. Please constrain the generated shape within these bounds.`;

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: fullPrompt, forceRoute: routePref, gridSize }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Generation failed");
        setStage("idle");
        return;
      }

      setRouteInfo({ route: data.route, reasoning: data.reasoning || "" });

      if (data.type === "code") {
        // PROCEDURAL — Code generated. Evaluate it in a sandbox.
        const newCommands: [VoxelKey, HexColor][] = [];

        // Safe sandbox tool
        const safePlace = (x: number, y: number, z: number, color: string) => {
          // Force coordinates to stay inside the grid
          const safeX = Math.max(0, Math.min(gridSize - 1, Math.floor(x)));
          const safeY = Math.max(0, Math.min(gridSize - 1, Math.floor(y)));
          const safeZ = Math.max(0, Math.min(gridSize - 1, Math.floor(z)));

          // Verify hex color
          const safeColor = /^#[0-9a-fA-F]{6}$/i.test(color) ? color : "#cccccc";

          newCommands.push([`${safeX},${safeY},${safeZ}` as VoxelKey, safeColor as HexColor]);
        };

        try {
          const sandbox = new Function("place", data.code);
          sandbox(safePlace);

          if (newCommands.length === 0) {
            throw new Error("No voxels generated by code.");
          }

          loadScene(newCommands);
          setVoxelCount(newCommands.length);
          setTruncated(!!data.truncated);
          setStage("done");
        } catch (err) {
          setError(err instanceof Error ? `Execution error: ${err.message}` : "Failed to execute AI code.");
          setStage("idle");
        }
      } else if (data.type === "glb") {
        // SEARCH — GLB URL ready
        setGlbData({ url: data.url, name: data.name || prompt });
        setStage("processing");
      } else if (data.type === "pending") {
        // GENERATE — model is loading, start polling
        setPendingTaskId(data.taskId);
        setPendingModel(data.model || null);
        setStage("processing");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setStage("idle");
    }
  }, [prompt, stage, routePref, loadScene, gridSize]);

  const handleVoxelize = useCallback(async () => {
    if (!glbData) return;
    setStage("voxelizing");
    setError(null);

    try {
      const commands = await voxelizeGLB(glbData.url, gridSize, scale);
      if (commands.length === 0) {
        setError("No voxels generated. Try adjusting the scale.");
        setStage("processing");
        return;
      }

      const entries: [VoxelKey, HexColor][] = commands
        .filter((c): c is Extract<typeof c, { type: "PLACE" }> => c.type === "PLACE")
        .map((c) => [c.key, c.color]);

      loadScene(entries);
      setVoxelCount(entries.length);
      setStage("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Voxelization failed");
      setStage("processing");
    }
  }, [glbData, scale, loadScene, gridSize]);

  const isLoading = stage === "routing" || stage === "processing" || stage === "voxelizing";

  return (
    <div
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg shadow-2xl p-4 flex flex-col gap-3 z-20"
      style={{ background: "#2a2a2a", width: 400, color: "#e0e0e0" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">AI Voxel Generator</span>
        <button
          onClick={toggleAIPanel}
          className="text-gray-500 hover:text-white text-lg leading-none"
        >
          &times;
        </button>
      </div>

      {/* Pipeline indicator */}
      {stage !== "idle" && <PipelineIndicator stage={stage} route={routeInfo?.route || null} />}

      {/* Prompt input */}
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe a 3D object... (e.g. 'a red sports car', 'a simple pyramid')"
        maxLength={500}
        rows={3}
        disabled={isLoading}
        className="w-full rounded px-2 py-1.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
        style={{ background: "#1a1a1a", color: "#e0e0e0", border: "1px solid #444" }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleGenerate();
          }
        }}
      />

      {/* Route Selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 min-w-fit">Route:</span>
        <select
          value={routePref}
          onChange={(e) => setRoutePref(e.target.value as any)}
          disabled={isLoading}
          className="w-full bg-[#1a1a1a] text-[#e0e0e0] border border-[#444] rounded px-1.5 py-1 text-xs focus:outline-none focus:border-blue-500 disabled:opacity-50"
        >
          <option value="AUTO">Auto (Let AI Decide)</option>
          <option value="PROCEDURAL">Procedural (Claude)</option>
          <option value="SEARCH">Search (Poly Pizza)</option>
          <option value="GENERATE">Generate (Hugging Face)</option>
        </select>
      </div>

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={isLoading || !prompt.trim()}
        className="w-full px-3 py-1.5 rounded text-sm font-medium transition-colors disabled:opacity-50"
        style={{ background: "#3b82f6", color: "white" }}
      >
        {stage === "routing" ? "Routing..." : stage === "processing" && pendingTaskId ? "Generating 3D model (~1 min)..." : "Generate"}
      </button>

      {/* Status message */}
      {isLoading && (
        <div className="text-xs text-blue-400 animate-pulse">
          {STAGE_LABELS[stage]}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-xs text-red-400 bg-red-900/30 rounded px-2 py-1">
          {error}
        </div>
      )}

      {/* Route reasoning */}
      {routeInfo && (
        <div className="text-[10px] text-gray-500">
          Route: <span className="text-gray-400">{routeInfo.route}</span> — {routeInfo.reasoning}
        </div>
      )}

      {/* Scale slider (for GLB models) */}
      {glbData && (stage as string) !== "voxelizing" && (
        <div className="flex flex-col gap-2 pt-2 border-t border-gray-600">
          <div className="text-xs text-gray-400">
            Model: <span className="text-gray-300">{glbData.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-10">Scale</span>
            <input
              type="range"
              min={0.25}
              max={1.0}
              step={0.05}
              value={scale}
              onChange={(e) => setScale(parseFloat(e.target.value))}
              className="flex-1 h-1 cursor-pointer"
              style={{ accentColor: "#3b82f6" }}
            />
            <span className="text-xs text-gray-400 w-10 text-right">
              {Math.round(scale * 100)}%
            </span>
          </div>
          <div className="text-[10px] text-gray-600">
            Fills ~{Math.round(scale * 100)}% of the {gridSize}×{gridSize}×{gridSize} grid
          </div>
          <button
            onClick={handleVoxelize}
            disabled={(stage as string) === "voxelizing"}
            className="w-full px-3 py-1.5 rounded text-sm font-medium transition-colors disabled:opacity-50"
            style={{ background: "#22c55e", color: "white" }}
          >
            {(stage as string) === "voxelizing" ? "Voxelizing..." : "Voxelize"}
          </button>
        </div>
      )}

      {/* Done state */}
      {stage === "done" && (
        <>
          <div className="text-xs text-green-400">
            Applied {voxelCount.toLocaleString()} voxels. Use Ctrl+Z to undo.
          </div>
          {truncated && (
            <div className="text-xs text-yellow-400 bg-yellow-900/30 rounded px-2 py-1">
              Output was truncated — some details may be missing. Try a simpler prompt.
            </div>
          )}
        </>
      )}

      {/* Footer */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => {
            setStage("idle");
            setRouteInfo(null);
            setGlbData(null);
            setError(null);
            setVoxelCount(0);
            if (pollRef.current) clearInterval(pollRef.current);
            setPendingTaskId(null);
            setPendingModel(null);
          }}
          className="flex-1 px-3 py-1 rounded text-xs transition-colors"
          style={{ background: "#444", color: "#ccc" }}
        >
          Reset
        </button>
        <button
          onClick={toggleAIPanel}
          className="flex-1 px-3 py-1 rounded text-xs transition-colors"
          style={{ background: "#333", color: "#999" }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
