"use client";

import { useRef, useEffect, useMemo, useCallback } from "react";
import {
  InstancedMesh,
  Matrix4,
  Color,
  BoxGeometry,
  MeshStandardMaterial,
  MeshBasicMaterial,
  Mesh,
  PlaneGeometry,
  DoubleSide,
  Raycaster,
  Vector2,
  Vector3,
  Plane,
} from "three";
import { ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { Edges } from "@react-three/drei";
import { MAX_INSTANCES } from "@/lib/constants";
import { useVoxelStore, parseKey, toKey, VoxelKey, VoxelCommand, HexColor } from "@/lib/store";
import { boxFillCommands, faceExtrudeCommands, getMirroredPositions } from "@/lib/brushes";

const tempMatrix = new Matrix4();
const tempColor = new Color();
const highlightColor = new Color();
const whiteColor = new Color("#ffffff");

// For drag ghost raycasting only
const dragRaycaster = new Raycaster();
const dragNDC = new Vector2();

function lightenColor(hex: string, amount: number): string {
  const c = new Color(hex);
  c.lerp(whiteColor, amount);
  return "#" + c.getHexString();
}

export default function VoxelRenderer() {
  const meshRef = useRef<InstancedMesh>(null);
  const selectionOutlineRef = useRef<InstancedMesh>(null);
  const groundRef = useRef<Mesh>(null);
  const ghostRef = useRef<Mesh>(null);
  const faceGhostRef = useRef<InstancedMesh>(null);
  const ghostEdgeColor = useRef("#ffffff");
  // Per-mesh index-to-key lookup
  const indexToKeyRef = useRef<VoxelKey[]>([]);
  const hoveredRef = useRef<{ key: VoxelKey; position: [number, number, number] } | null>(null);
  const lastHitRef = useRef<{ instanceId?: number; hitType: "voxel" | "ground"; meshObject?: object } | null>(null);
  const shiftHeldRef = useRef(false);

  // Drag move state
  const isDragging = useRef(false);
  const dragStartKey = useRef<VoxelKey | null>(null);
  const dragStartPos = useRef<[number, number, number]>([0, 0, 0]);
  const dragOffset = useRef<[number, number, number]>([0, 0, 0]);
  const dragGhostRef = useRef<InstancedMesh>(null);
  const pointerDownPos = useRef({ x: 0, y: 0 });

  // Box brush state
  const boxBrushStart = useRef<[number, number, number] | null>(null);
  const boxBrushEnd = useRef<[number, number, number] | null>(null);
  const isBoxDragging = useRef(false);
  const boxPreviewRef = useRef<Mesh>(null);

  // Voxel brush (continuous painting) state
  const isVoxelBrushing = useRef(false);
  const voxelBrushPending = useRef(false);
  const voxelBrushPendingPos = useRef<[number, number, number]>([0, 0, 0]);
  const voxelBrushCount = useRef(0);
  const voxelBrushDidDrag = useRef(false);

  const { camera, gl } = useThree();
  const gridSize = useVoxelStore((s) => s.gridSize);

  // Geometries & materials
  const geometry = useMemo(() => new BoxGeometry(0.98, 0.98, 0.98), []);
  const material = useMemo(() => new MeshStandardMaterial(), []);
  const outlineGeo = useMemo(() => new BoxGeometry(1.02, 1.02, 1.02), []);
  const outlineMat = useMemo(
    () => new MeshBasicMaterial({ color: "#00aaff", transparent: true, opacity: 0.25, depthWrite: false }),
    [],
  );
  const ghostGeo = useMemo(() => new BoxGeometry(1.01, 1.01, 1.01), []);
  const ghostMat = useMemo(
    () => new MeshBasicMaterial({ transparent: true, opacity: 0.2, depthWrite: false, color: "#ffffff", side: DoubleSide }),
    [],
  );
  const faceGhostGeo = useMemo(() => new BoxGeometry(1.02, 1.02, 1.02), []);
  const faceGhostMat = useMemo(
    () => new MeshBasicMaterial({ transparent: true, opacity: 0.2, depthWrite: false, color: "#44aaff", side: DoubleSide }),
    [],
  );
  const dragGhostGeo = useMemo(() => new BoxGeometry(0.96, 0.96, 0.96), []);
  const dragGhostMat = useMemo(
    () => new MeshBasicMaterial({ transparent: true, opacity: 0.3, depthWrite: false, color: "#88ccff" }),
    [],
  );
  const boxPreviewGeo = useMemo(() => new BoxGeometry(1, 1, 1), []);
  const boxPreviewMat = useMemo(
    () => new MeshBasicMaterial({ transparent: true, opacity: 0.2, depthWrite: false, color: "#44aaff", side: DoubleSide }),
    [],
  );
  const groundGeo = useMemo(() => new PlaneGeometry(gridSize, gridSize), [gridSize]);
  const groundMat = useMemo(() => new MeshBasicMaterial({ transparent: true, opacity: 0, side: DoubleSide }), []);

  // Initialize imperative-only meshes as hidden
  useEffect(() => {
    if (ghostRef.current) ghostRef.current.visible = false;
    if (dragGhostRef.current) dragGhostRef.current.visible = false;
    if (boxPreviewRef.current) boxPreviewRef.current.visible = false;
    if (faceGhostRef.current) faceGhostRef.current.visible = false;
  }, []);

  const rebuildInstances = useCallback(() => {
    const mesh = meshRef.current;
    const outline = selectionOutlineRef.current;
    if (!mesh) return;

    const voxels = useVoxelStore.getState().voxels;
    const selected = useVoxelStore.getState().selectedVoxels;

    const keys: VoxelKey[] = [];
    let i = 0;
    let oi = 0;

    for (const [key, color] of voxels) {
      if (i >= MAX_INSTANCES) break;

      const [x, y, z] = parseKey(key);
      tempMatrix.makeTranslation(x, y, z);

      mesh.setMatrixAt(i, tempMatrix);

      if (selected.has(key)) {
        highlightColor.set(color).lerp(new Color("#88ccff"), 0.3);
        mesh.setColorAt(i, highlightColor);
        if (outline && oi < MAX_INSTANCES) {
          outline.setMatrixAt(oi, tempMatrix);
          oi++;
        }
      } else {
        tempColor.set(color);
        mesh.setColorAt(i, tempColor);
      }

      keys.push(key);
      i++;
    }

    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    indexToKeyRef.current = keys;
    mesh.computeBoundingSphere();

    if (outline) {
      outline.count = oi;
      outline.instanceMatrix.needsUpdate = true;
    }
  }, []);

  useEffect(() => {
    rebuildInstances();
    let prevVoxels = useVoxelStore.getState().voxels;
    let prevSelected = useVoxelStore.getState().selectedVoxels;
    let prevWireframe = useVoxelStore.getState().showWireframe;
    const unsub = useVoxelStore.subscribe((state) => {
      if (state.voxels !== prevVoxels || state.selectedVoxels !== prevSelected) {
        prevVoxels = state.voxels;
        prevSelected = state.selectedVoxels;
        rebuildInstances();
      }
      if (state.showWireframe !== prevWireframe) {
        prevWireframe = state.showWireframe;
        material.wireframe = state.showWireframe;
        material.needsUpdate = true;
      }
    });
    return unsub;
  }, [rebuildInstances, material]);

  // Track shift key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { shiftHeldRef.current = e.shiftKey; };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, []);

  // === R3F Event Handlers ===

  const placeWithMirror = useCallback((positions: [number, number, number][], color: HexColor) => {
    const store = useVoxelStore.getState();
    const { mirrorAxes, voxels, executeBatch, placeVoxel } = store;
    const allPositions = getMirroredPositions(positions, mirrorAxes, gridSize);
    const validPositions = allPositions.filter(([x, y, z]) =>
      x >= 0 && x < gridSize && y >= 0 && y < gridSize && z >= 0 && z < gridSize && !voxels.has(toKey(x, y, z))
    );
    if (validPositions.length === 0) return;
    if (validPositions.length === 1 && !mirrorAxes.x && !mirrorAxes.y && !mirrorAxes.z) {
      placeVoxel(toKey(validPositions[0][0], validPositions[0][1], validPositions[0][2]), color);
    } else {
      const commands: VoxelCommand[] = validPositions.map(([x, y, z]) => ({
        type: "PLACE" as const, key: toKey(x, y, z), color,
      }));
      executeBatch(commands);
    }
  }, [gridSize]);

  // Hover handler for voxel mesh
  const onVoxelPointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const ghost = ghostRef.current;
    const faceGhost = faceGhostRef.current;
    if (!ghost || !faceGhost) return;
    if (e.instanceId === undefined) return;

    const key = indexToKeyRef.current[e.instanceId];
    if (!key) return;
    const [x, y, z] = parseKey(key);

    const store = useVoxelStore.getState();
    const { activeMode, activeBrush, activeColor, selectedVoxels } = store;

    if (activeMode === "attach") {
      const normal = e.face?.normal;
      if (!normal) {
        ghost.visible = false;
        faceGhost.visible = false;
        hoveredRef.current = null;
        lastHitRef.current = null;
        return;
      }
      const nx = x + Math.round(normal.x);
      const ny = y + Math.round(normal.y);
      const nz = z + Math.round(normal.z);
      if (nx < 0 || nx >= gridSize || ny < 0 || ny >= gridSize || nz < 0 || nz >= gridSize) {
        ghost.visible = false;
        faceGhost.visible = false;
        hoveredRef.current = null;
        lastHitRef.current = null;
        return;
      }

      // Voxel brush: detect drag threshold to activate continuous brushing
      if (voxelBrushPending.current && activeBrush === "voxel" && !isVoxelBrushing.current) {
        const dx = e.nativeEvent.clientX - pointerDownPos.current.x;
        const dy = e.nativeEvent.clientY - pointerDownPos.current.y;
        if (Math.sqrt(dx * dx + dy * dy) > 5) {
          // Activate continuous brushing — place the pending first voxel
          isVoxelBrushing.current = true;
          voxelBrushDidDrag.current = true;
          const [ppx, ppy, ppz] = voxelBrushPendingPos.current;
          if (!store.voxels.has(toKey(ppx, ppy, ppz))) {
            placeWithMirror([[ppx, ppy, ppz]], activeColor);
            voxelBrushCount.current++;
          }
        }
      }

      // Continuous voxel brush: place while dragging
      if (isVoxelBrushing.current && activeBrush === "voxel") {
        const placeKey = toKey(nx, ny, nz);
        if (!store.voxels.has(placeKey)) {
          placeWithMirror([[nx, ny, nz]], activeColor);
          voxelBrushCount.current++;
        }
        hoveredRef.current = { key: placeKey, position: [nx, ny, nz] };
        ghost.position.set(nx, ny, nz);
        ghost.visible = true;
        faceGhost.visible = false;
        lastHitRef.current = { instanceId: e.instanceId, hitType: "voxel", meshObject: e.object };
        return;
      }

      if (activeBrush === "face") {
        let commands = faceExtrudeCommands(key, [Math.round(normal.x), Math.round(normal.y), Math.round(normal.z)], store.voxels, gridSize);
        if (store.mirrorAxes.x || store.mirrorAxes.y || store.mirrorAxes.z) {
          const positions = commands
            .filter((cmd): cmd is Extract<VoxelCommand, { type: "PLACE" }> => cmd.type === "PLACE")
            .map(cmd => parseKey(cmd.key) as [number, number, number]);
          const mirrored = getMirroredPositions(positions, store.mirrorAxes, gridSize);
          commands = mirrored
            .filter(([mx, my, mz]) => mx >= 0 && mx < gridSize && my >= 0 && my < gridSize && mz >= 0 && mz < gridSize && !store.voxels.has(toKey(mx, my, mz)))
            .map(([mx, my, mz]) => ({ type: "PLACE" as const, key: toKey(mx, my, mz), color: activeColor }));
        }

        let gi = 0;
        for (const cmd of commands) {
          if (cmd.type === "PLACE" && gi < MAX_INSTANCES) {
            const [px, py, pz] = parseKey(cmd.key);
            tempMatrix.makeTranslation(px, py, pz);
            faceGhost.setMatrixAt(gi, tempMatrix);
            gi++;
          }
        }
        faceGhost.count = gi;
        faceGhost.instanceMatrix.needsUpdate = true;
        faceGhostMat.color.set(lightenColor(activeColor, 0.4));
        faceGhost.visible = true;
        ghost.visible = false;
        hoveredRef.current = { key: toKey(nx, ny, nz), position: [nx, ny, nz] };
      } else {
        ghost.position.set(nx, ny, nz);
        ghostMat.color.set(lightenColor(activeColor, 0.4));
        ghostMat.opacity = 0.35;
        ghostEdgeColor.current = lightenColor(activeColor, 0.2);
        hoveredRef.current = { key: toKey(nx, ny, nz), position: [nx, ny, nz] };
        ghost.visible = true;
        faceGhost.visible = false;
      }
    } else {
      ghost.position.set(x, y, z);
      ghostMat.color.set(selectedVoxels.has(key) ? "#88ccff" : "#ffffff");
      ghostMat.opacity = 0.2;
      ghostEdgeColor.current = selectedVoxels.has(key) ? "#00aaff" : "#aaaaaa";
      hoveredRef.current = { key, position: [x, y, z] };
      ghost.visible = true;
      faceGhost.visible = false;
    }

    lastHitRef.current = { instanceId: e.instanceId, hitType: "voxel", meshObject: e.object };
  }, [ghostMat, faceGhostMat, gridSize]);

  // Hover handler for ground plane
  const onGroundPointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const ghost = ghostRef.current;
    const faceGhost = faceGhostRef.current;
    if (!ghost || !faceGhost) return;

    const { activeMode, activeColor, activeBrush } = useVoxelStore.getState();
    if (activeMode !== "attach") return;

    const x = Math.floor(e.point.x + 0.5);
    const z = Math.floor(e.point.z + 0.5);
    if (x < 0 || x >= gridSize || z < 0 || z >= gridSize) {
      ghost.visible = false;
      faceGhost.visible = false;
      hoveredRef.current = null;
      lastHitRef.current = null;
      return;
    }
    const gKey = toKey(x, 0, z);
    if (useVoxelStore.getState().voxels.has(gKey)) {
      ghost.visible = false;
      faceGhost.visible = false;
      hoveredRef.current = null;
      lastHitRef.current = null;
      return;
    }

    // Voxel brush: detect drag threshold on ground
    if (voxelBrushPending.current && activeBrush === "voxel" && !isVoxelBrushing.current) {
      const dx = e.nativeEvent.clientX - pointerDownPos.current.x;
      const dy = e.nativeEvent.clientY - pointerDownPos.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > 5) {
        isVoxelBrushing.current = true;
        voxelBrushDidDrag.current = true;
        const [ppx, ppy, ppz] = voxelBrushPendingPos.current;
        if (!useVoxelStore.getState().voxels.has(toKey(ppx, ppy, ppz))) {
          placeWithMirror([[ppx, ppy, ppz]], activeColor);
          voxelBrushCount.current++;
        }
      }
    }

    // Continuous voxel brush on ground
    if (isVoxelBrushing.current && activeBrush === "voxel") {
      placeWithMirror([[x, 0, z]], activeColor);
      voxelBrushCount.current++;
      hoveredRef.current = { key: gKey, position: [x, 0, z] };
      ghost.position.set(x, 0, z);
      ghost.visible = true;
      faceGhost.visible = false;
      lastHitRef.current = { hitType: "ground", meshObject: e.object };
      return;
    }

    ghost.position.set(x, 0, z);
    ghostMat.color.set(lightenColor(activeColor, 0.4));
    ghostMat.opacity = 0.35;
    ghostEdgeColor.current = lightenColor(activeColor, 0.2);
    hoveredRef.current = { key: gKey, position: [x, 0, z] };
    lastHitRef.current = { hitType: "ground", meshObject: e.object };
    ghost.visible = true;
    faceGhost.visible = false;
  }, [ghostMat, gridSize]);

  // Click handler for voxel mesh
  const onVoxelClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 5) return;
    e.stopPropagation();
    if (e.instanceId === undefined) return;

    const key = indexToKeyRef.current[e.instanceId];
    if (!key) return;

    const store = useVoxelStore.getState();
    const { activeMode, activeColor, activeBrush, selectVoxel, executeBatch } = store;

    // Select mode
    if (activeMode === "select") {
      selectVoxel(key, shiftHeldRef.current);
      return;
    }

    // Attach mode — skip if voxel brush drag just finished
    if (voxelBrushDidDrag.current) {
      voxelBrushDidDrag.current = false;
      return;
    }

    const [x, y, z] = parseKey(key);
    const normal = e.face?.normal;
    if (!normal) return;

    const nx = Math.round(normal.x);
    const ny = Math.round(normal.y);
    const nz = Math.round(normal.z);

    // Face brush — BFS extrude
    if (activeBrush === "face") {
      let commands = faceExtrudeCommands(key, [nx, ny, nz], store.voxels, gridSize);
      if (store.mirrorAxes.x || store.mirrorAxes.y || store.mirrorAxes.z) {
        const sourceColor = store.voxels.get(key)!;
        const positions = commands
          .filter((cmd): cmd is Extract<VoxelCommand, { type: "PLACE" }> => cmd.type === "PLACE")
          .map(cmd => parseKey(cmd.key) as [number, number, number]);
        const mirrored = getMirroredPositions(positions, store.mirrorAxes, gridSize);
        commands = mirrored
          .filter(([mx, my, mz]) => mx >= 0 && mx < gridSize && my >= 0 && my < gridSize && mz >= 0 && mz < gridSize && !store.voxels.has(toKey(mx, my, mz)))
          .map(([mx, my, mz]) => ({ type: "PLACE" as const, key: toKey(mx, my, mz), color: sourceColor }));
      }
      if (commands.length > 0) executeBatch(commands);
      return;
    }

    // Single voxel placement
    const px = x + nx;
    const py = y + ny;
    const pz = z + nz;
    if (px < 0 || px >= gridSize || py < 0 || py >= gridSize || pz < 0 || pz >= gridSize) return;
    placeWithMirror([[px, py, pz]], activeColor);
  }, [placeWithMirror, gridSize]);

  // Click handler for ground plane
  const onGroundClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 5) return;
    e.stopPropagation();

    const { activeMode, activeColor } = useVoxelStore.getState();
    if (activeMode !== "attach") return;
    if (voxelBrushDidDrag.current) {
      voxelBrushDidDrag.current = false;
      return;
    }

    const x = Math.floor(e.point.x + 0.5);
    const z = Math.floor(e.point.z + 0.5);
    if (x < 0 || x >= gridSize || z < 0 || z >= gridSize) return;

    placeWithMirror([[x, 0, z]], activeColor);
  }, [placeWithMirror, gridSize]);

  // Pointer down on voxel — for box brush start and selection drag start
  const onVoxelPointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (e.nativeEvent.button !== 0) return;
    pointerDownPos.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };

    const store = useVoxelStore.getState();

    // Voxel brush — record pending (don't place yet, wait for click vs drag)
    if (store.activeMode === "attach" && store.activeBrush === "voxel" && hoveredRef.current) {
      voxelBrushPending.current = true;
      voxelBrushPendingPos.current = hoveredRef.current.position;
      isVoxelBrushing.current = false;
      voxelBrushDidDrag.current = false;
      voxelBrushCount.current = 0;
    }

    // Box brush start
    if (store.activeMode === "attach" && store.activeBrush === "box" && hoveredRef.current) {
      boxBrushStart.current = hoveredRef.current.position;
      boxBrushEnd.current = hoveredRef.current.position;
      isBoxDragging.current = false;
    }

    // Selection drag start
    if (store.activeMode === "select" && store.selectedVoxels.size > 0 && e.instanceId !== undefined) {
      const key = indexToKeyRef.current[e.instanceId];
      if (key && store.selectedVoxels.has(key)) {
        dragStartKey.current = key;
        dragStartPos.current = parseKey(key);
        dragOffset.current = [0, 0, 0];
      }
    }
  }, [placeWithMirror]);

  // Pointer down on ground — for box brush start
  const onGroundPointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (e.nativeEvent.button !== 0) return;
    pointerDownPos.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };

    const store = useVoxelStore.getState();

    // Voxel brush — record pending on ground
    if (store.activeMode === "attach" && store.activeBrush === "voxel" && hoveredRef.current) {
      voxelBrushPending.current = true;
      voxelBrushPendingPos.current = hoveredRef.current.position;
      isVoxelBrushing.current = false;
      voxelBrushCount.current = 0;
    }

    if (store.activeMode === "attach" && store.activeBrush === "box" && hoveredRef.current) {
      boxBrushStart.current = hoveredRef.current.position;
      boxBrushEnd.current = hoveredRef.current.position;
      isBoxDragging.current = false;
    }
  }, [placeWithMirror]);

  const onPointerOut = useCallback(() => {
    const ghost = ghostRef.current;
    if (ghost && !isBoxDragging.current && !isDragging.current && !isVoxelBrushing.current) {
      ghost.visible = false;
      if (faceGhostRef.current) faceGhostRef.current.visible = false;
      lastHitRef.current = null;
      hoveredRef.current = null;
    }
  }, []);

  // useFrame — only for drag ghost preview and box brush preview
  useFrame(() => {
    const mesh = meshRef.current;
    const ground = groundRef.current;
    const dragGhost = dragGhostRef.current;
    if (!mesh) return;

    const allMeshes = [mesh];

    // Selection drag ghost preview
    if (isDragging.current && dragGhost) {
      const { selectedVoxels } = useVoxelStore.getState();
      if (selectedVoxels.size > 0) {
        dragRaycaster.setFromCamera(dragNDC, camera);
        const targets = ground ? [...allMeshes, ground] : allMeshes;
        const hits = dragRaycaster.intersectObjects(targets);

        const voxelHit = hits.find(h => allMeshes.includes(h.object as InstancedMesh) && h.instanceId !== undefined);
        const groundHit = hits.find(h => h.object === ground);

        if (voxelHit && voxelHit.instanceId !== undefined) {
          const hitKey = indexToKeyRef.current[voxelHit.instanceId];
          if (hitKey && !selectedVoxels.has(hitKey)) {
            const [hx, hy, hz] = parseKey(hitKey);
            const normal = voxelHit.face?.normal;
            if (normal) {
              const [sx, sy, sz] = dragStartPos.current;
              dragOffset.current = [hx + Math.round(normal.x) - sx, hy + Math.round(normal.y) - sy, hz + Math.round(normal.z) - sz];
            }
          }
        } else if (groundHit) {
          const gx = Math.floor(groundHit.point.x + 0.5);
          const gz = Math.floor(groundHit.point.z + 0.5);
          const [sx, , sz] = dragStartPos.current;
          dragOffset.current = [gx - sx, 0 - dragStartPos.current[1], gz - sz];
        }

        const [dx, dy, dz] = dragOffset.current;
        let gi = 0;
        for (const key of selectedVoxels) {
          if (gi >= MAX_INSTANCES) break;
          const [x, y, z] = parseKey(key);
          tempMatrix.makeTranslation(x + dx, y + dy, z + dz);
          dragGhost.setMatrixAt(gi, tempMatrix);
          gi++;
        }
        dragGhost.count = gi;
        dragGhost.instanceMatrix.needsUpdate = true;
        dragGhost.visible = true;
        const ghost = ghostRef.current;
        if (ghost) ghost.visible = false;
        return;
      }
    }

    if (dragGhost) dragGhost.visible = false;

    // Box brush preview
    const boxPreview = boxPreviewRef.current;
    if (boxPreview) {
      if (isBoxDragging.current && boxBrushStart.current && boxBrushEnd.current) {
        const [sx, sy, sz] = boxBrushStart.current;
        const [ex, ey, ez] = boxBrushEnd.current;
        const minX = Math.min(sx, ex), minY = Math.min(sy, ey), minZ = Math.min(sz, ez);
        const maxX = Math.max(sx, ex), maxY = Math.max(sy, ey), maxZ = Math.max(sz, ez);
        const sizeX = maxX - minX + 1, sizeY = maxY - minY + 1, sizeZ = maxZ - minZ + 1;
        boxPreview.position.set(minX + (sizeX - 1) / 2, minY + (sizeY - 1) / 2, minZ + (sizeZ - 1) / 2);
        boxPreview.scale.set(sizeX, sizeY, sizeZ);
        boxPreview.visible = true;
      } else {
        boxPreview.visible = false;
      }
    }
  });

  // Window-level handlers — drag detection, box brush completion, selection move
  useEffect(() => {
    const onWindowMove = (e: PointerEvent) => {
      // Update drag NDC for useFrame drag ghost raycasting
      const canvas = gl.domElement;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        dragNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        dragNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      }

      // Box brush drag detection
      if (boxBrushStart.current && !isBoxDragging.current) {
        const dx = e.clientX - pointerDownPos.current.x;
        const dy = e.clientY - pointerDownPos.current.y;
        if (Math.sqrt(dx * dx + dy * dy) > 8) {
          isBoxDragging.current = true;
        }
      }

      // Update box brush end position during drag
      if (isBoxDragging.current) {
        if (e.shiftKey && boxBrushStart.current && boxBrushEnd.current) {
          const plane = new Plane();
          const cameraDir = new Vector3();
          camera.getWorldDirection(cameraDir);
          cameraDir.y = 0;
          cameraDir.normalize();
          plane.setFromNormalAndCoplanarPoint(
            cameraDir.clone().negate(),
            new Vector3(boxBrushEnd.current[0], boxBrushEnd.current[1], boxBrushEnd.current[2])
          );

          dragRaycaster.setFromCamera(dragNDC, camera);
          const intersectPoint = new Vector3();
          if (dragRaycaster.ray.intersectPlane(plane, intersectPoint)) {
            const y = Math.max(0, Math.min(gridSize - 1, Math.floor(intersectPoint.y + 0.5)));
            boxBrushEnd.current = [boxBrushEnd.current[0], y, boxBrushEnd.current[2]];
          }
        } else if (hoveredRef.current) {
          boxBrushEnd.current = hoveredRef.current.position;
        }
      }

      // Selection drag detection
      if (dragStartKey.current && !isDragging.current) {
        const dx = e.clientX - pointerDownPos.current.x;
        const dy = e.clientY - pointerDownPos.current.y;
        if (Math.sqrt(dx * dx + dy * dy) > 8) {
          isDragging.current = true;
        }
      }
    };

    const onWindowUp = (e: PointerEvent) => {
      if (e.button === 0) {
        // Voxel brush completion
        if (isVoxelBrushing.current || voxelBrushPending.current) {
          const wasBrushing = isVoxelBrushing.current;
          isVoxelBrushing.current = false;
          voxelBrushPending.current = false;

          if (wasBrushing) {
            // Consolidate undo stack into single BATCH
            const count = voxelBrushCount.current;
            if (count > 1) {
              const store = useVoxelStore.getState();
              const popped: VoxelCommand[] = [];
              for (let i = 0; i < count && store.undoStack.length > 0; i++) {
                const cmd = store.undoStack.pop()!;
                if (cmd.type === "BATCH") {
                  popped.push(...cmd.commands);
                } else {
                  popped.push(cmd);
                }
              }
              popped.reverse();
              if (popped.length > 0) {
                store.undoStack.push({ type: "BATCH", commands: popped });
              }
            }
          }
          voxelBrushCount.current = 0;
        }

        // Box brush completion
        if (isBoxDragging.current && boxBrushStart.current && boxBrushEnd.current) {
          const store = useVoxelStore.getState();
          let commands = boxFillCommands(boxBrushStart.current, boxBrushEnd.current, store.activeColor, store.voxels, gridSize);
          if (store.mirrorAxes.x || store.mirrorAxes.y || store.mirrorAxes.z) {
            const positions = commands
              .filter((cmd): cmd is Extract<VoxelCommand, { type: "PLACE" }> => cmd.type === "PLACE")
              .map(cmd => parseKey(cmd.key) as [number, number, number]);
            const mirrored = getMirroredPositions(positions, store.mirrorAxes, gridSize);
            commands = mirrored
              .filter(([x, y, z]) => x >= 0 && x < gridSize && y >= 0 && y < gridSize && z >= 0 && z < gridSize && !store.voxels.has(toKey(x, y, z)))
              .map(([x, y, z]) => ({ type: "PLACE" as const, key: toKey(x, y, z), color: store.activeColor }));
          }
          if (commands.length > 0) store.executeBatch(commands);
        }

        // Safety reset: ALWAYS forcefully clear box brush tracking data on mouse up
        // This prevents the brush from permanently locking if the user drags off-canvas
        boxBrushStart.current = null;
        boxBrushEnd.current = null;
        isBoxDragging.current = false;

        // Selection drag completion
        if (isDragging.current) {
          isDragging.current = false;
          dragStartKey.current = null;

          const [dx, dy, dz] = dragOffset.current;
          if (dx === 0 && dy === 0 && dz === 0) return;

          const store = useVoxelStore.getState();
          const keys = Array.from(store.selectedVoxels);
          const oldKeySet = new Set(keys);

          let overlapCount = 0;
          for (const key of keys) {
            const [x, y, z] = parseKey(key);
            const newKey = toKey(x + dx, y + dy, z + dz);
            if (store.voxels.has(newKey) && !oldKeySet.has(newKey)) overlapCount++;
          }

          if (overlapCount > 0) {
            const replace = window.confirm(
              `Moving will replace ${overlapCount} existing voxel(s). Replace them, or cancel to revert?`
            );
            if (replace) {
              store.moveVoxels(keys, [dx, dy, dz], true);
            }
          } else {
            store.moveVoxels(keys, [dx, dy, dz], false);
          }
          return;
        }

        dragStartKey.current = null;
      }

    };

    window.addEventListener("pointermove", onWindowMove, true);
    window.addEventListener("pointerup", onWindowUp, true);
    return () => {
      window.removeEventListener("pointermove", onWindowMove, true);
      window.removeEventListener("pointerup", onWindowUp, true);
    };
  }, [gl, camera, gridSize]);

  useEffect(() => {
    return () => {
      geometry.dispose(); material.dispose();
      ghostGeo.dispose(); ghostMat.dispose();
      faceGhostGeo.dispose(); faceGhostMat.dispose();
      groundGeo.dispose(); groundMat.dispose();
      outlineGeo.dispose(); outlineMat.dispose();
      dragGhostGeo.dispose(); dragGhostMat.dispose();
      boxPreviewGeo.dispose(); boxPreviewMat.dispose();
    };
  }, [geometry, material, ghostGeo, ghostMat, faceGhostGeo, faceGhostMat, groundGeo, groundMat, outlineGeo, outlineMat, dragGhostGeo, dragGhostMat, boxPreviewGeo, boxPreviewMat]);

  return (
    <group onPointerOut={onPointerOut}>
      <instancedMesh
        ref={meshRef}
        args={[geometry, material, MAX_INSTANCES]}
        onPointerMove={onVoxelPointerMove}
        onClick={onVoxelClick}
        onPointerDown={onVoxelPointerDown}
      />
      <instancedMesh ref={selectionOutlineRef} args={[outlineGeo, outlineMat, MAX_INSTANCES]} renderOrder={998} />
      <instancedMesh ref={dragGhostRef} args={[dragGhostGeo, dragGhostMat, MAX_INSTANCES]} renderOrder={999} />
      <instancedMesh ref={faceGhostRef} args={[faceGhostGeo, faceGhostMat, MAX_INSTANCES]} renderOrder={1000} />
      <mesh ref={ghostRef} geometry={ghostGeo} material={ghostMat} renderOrder={999}>
        <Edges color={ghostEdgeColor.current} linewidth={1.5} />
      </mesh>
      <mesh ref={boxPreviewRef} geometry={boxPreviewGeo} material={boxPreviewMat} renderOrder={997}>
        <Edges color="#44aaff" linewidth={1.5} />
      </mesh>
      {/* Visual grid on ground */}
      <gridHelper args={[gridSize, gridSize, "#888888", "#cccccc"]} position={[gridSize / 2 - 0.5, 0, gridSize / 2 - 0.5]} />
      {/* Invisible ground plane for raycasting + clicks */}
      <mesh
        ref={groundRef}
        geometry={groundGeo}
        material={groundMat}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[gridSize / 2 - 0.5, -0.01, gridSize / 2 - 0.5]}
        onPointerMove={onGroundPointerMove}
        onClick={onGroundClick}
        onPointerDown={onGroundPointerDown}
      />
    </group>
  );
}
