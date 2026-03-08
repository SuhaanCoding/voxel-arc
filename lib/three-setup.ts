import { BufferGeometry, Mesh } from "three";
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from "three-mesh-bvh";

// Patch Three.js prototypes to use BVH for all raycasting.
// Must be imported before any GLTFLoader or raycast-dependent code runs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(BufferGeometry.prototype as any).computeBoundsTree = computeBoundsTree;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(BufferGeometry.prototype as any).disposeBoundsTree = disposeBoundsTree;
Mesh.prototype.raycast = acceleratedRaycast;
