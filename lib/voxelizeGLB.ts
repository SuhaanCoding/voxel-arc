import {
  Box3,
  Vector3,
  Mesh,
  MeshStandardMaterial,
  MeshBasicMaterial,
  MeshPhongMaterial,
  Texture,
  Material,
  Triangle,
  BufferAttribute,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { toKey, HexColor } from "./store";
import type { VoxelCommand } from "./store";

// Reusable objects
const tempBox = new Box3();
const tempVec = new Vector3();
const modelBounds = new Box3();

// --- Texture sampling ---
const textureCanvasCache = new Map<Texture, { ctx: CanvasRenderingContext2D; w: number; h: number }>();

function sampleTextureCached(texture: Texture, u: number, v: number): string {
  const image = texture.image as HTMLImageElement | HTMLCanvasElement | undefined;
  if (!image || !("width" in image)) return "#888888";

  let cached = textureCanvasCache.get(texture);
  if (!cached) {
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "#888888";
    ctx.drawImage(image, 0, 0);
    cached = { ctx, w: image.width, h: image.height };
    textureCanvasCache.set(texture, cached);
  }

  const px = ((Math.floor(u * cached.w) % cached.w) + cached.w) % cached.w;
  const py = ((Math.floor((1 - v) * cached.h) % cached.h) + cached.h) % cached.h;
  const pixel = cached.ctx.getImageData(px, py, 1, 1).data;
  return "#" + ((1 << 24) | (pixel[0] << 16) | (pixel[1] << 8) | pixel[2]).toString(16).slice(1);
}

function getColorFromMaterial(material: Material): string {
  const mat = material as MeshStandardMaterial | MeshBasicMaterial | MeshPhongMaterial;
  if (mat.color) return "#" + mat.color.getHexString();
  return "#888888";
}

/**
 * Get the average color of a triangle from its material.
 * Uses the centroid UV if the material has a texture.
 */
function getTriangleColor(
  mesh: Mesh,
  faceIndex: number,
): string {
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const mat = material as MeshStandardMaterial | MeshBasicMaterial | MeshPhongMaterial;

  if (mat.map) {
    const uvAttr = mesh.geometry.attributes.uv;
    if (uvAttr) {
      const indexAttr = mesh.geometry.index;
      let i0: number, i1: number, i2: number;
      if (indexAttr) {
        i0 = indexAttr.getX(faceIndex * 3);
        i1 = indexAttr.getX(faceIndex * 3 + 1);
        i2 = indexAttr.getX(faceIndex * 3 + 2);
      } else {
        i0 = faceIndex * 3;
        i1 = faceIndex * 3 + 1;
        i2 = faceIndex * 3 + 2;
      }
      // Centroid UV
      const u = (uvAttr.getX(i0) + uvAttr.getX(i1) + uvAttr.getX(i2)) / 3;
      const v = (uvAttr.getY(i0) + uvAttr.getY(i1) + uvAttr.getY(i2)) / 3;
      return sampleTextureCached(mat.map, u, v);
    }
  }

  return getColorFromMaterial(material);
}



/**
 * Voxelize a GLB model using BVH-accelerated AABB intersection.
 *
 * For every voxel cell in the grid, we ask: "Does this box overlap any triangle?"
 * The BVH makes this O(log n) per voxel instead of O(n triangles).
 *
 * @param glbUrl - URL to the .glb file
 * @param gridSize - Size of the voxel grid (e.g. 50 for 50×50×50)
 * @param scale - 0.25 to 1.0, fraction of grid the model should fill
 * @returns Array of PLACE commands ready for executeBatch/loadScene
 */
export async function voxelizeGLB(
  glbUrl: string,
  gridSize: number,
  scale: number = 0.8
): Promise<VoxelCommand[]> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(glbUrl);
  const scene = gltf.scene;

  // Collect all meshes, apply world transforms, build BVH
  const meshes: Mesh[] = [];
  scene.updateMatrixWorld(true);

  scene.traverse((node) => {
    if (node instanceof Mesh && node.geometry) {
      node.geometry = node.geometry.clone();
      node.geometry.applyMatrix4(node.matrixWorld);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (node.geometry as any).computeBoundsTree();
      meshes.push(node);
    }
  });

  if (meshes.length === 0) {
    throw new Error("No meshes found in GLB file");
  }

  // Compute unified bounding box
  modelBounds.makeEmpty();
  for (const mesh of meshes) {
    tempBox.setFromBufferAttribute(mesh.geometry.attributes.position as BufferAttribute);
    modelBounds.union(tempBox);
  }

  // Scale to fit grid
  const size = modelBounds.getSize(tempVec);
  const longestAxis = Math.max(size.x, size.y, size.z);
  if (longestAxis === 0) throw new Error("Model has zero size");

  const fitSize = (gridSize - 2) * scale;
  const scaleFactor = fitSize / longestAxis;
  const center = modelBounds.getCenter(new Vector3());
  const minY = modelBounds.min.y;

  // Inverse: grid space → model space
  const fromGridX = (gx: number) => (gx - gridSize / 2) / scaleFactor + center.x;
  const fromGridY = (gy: number) => gy / scaleFactor + minY;
  const fromGridZ = (gz: number) => (gz - gridSize / 2) / scaleFactor + center.z;

  const commands: VoxelCommand[] = [];
  const placed = new Set<string>();

  // Use a 3D grid loop over all potential voxels.
  // For each single box, we ask the BVH filing cabinet: "Does this specific box overlap with any triangles?"
  for (let gx = 0; gx < gridSize; gx++) {
    for (let gy = 0; gy < gridSize; gy++) {
      for (let gz = 0; gz < gridSize; gz++) {

        // Calculate the voxel AABB in world space
        const vMinX = fromGridX(gx - 0.5);
        const vMaxX = fromGridX(gx + 0.5);
        const vMinY = fromGridY(gy - 0.5);
        const vMaxY = fromGridY(gy + 0.5);
        const vMinZ = fromGridZ(gz - 0.5);
        const vMaxZ = fromGridZ(gz + 0.5);

        tempBox.min.set(vMinX, vMinY, vMinZ);
        tempBox.max.set(vMaxX, vMaxY, vMaxZ);

        let hitColor: string | null = null;

        for (const mesh of meshes) {
          const geo = mesh.geometry;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const bvh = (geo as any).boundsTree;
          if (!bvh) continue;

          // We use shapecast to do exactly what bvh.intersectsBox does,
          // but shapecast gives us the triIndex needed to sample the texture color!
          bvh.shapecast({
            intersectsBounds: (box: Box3) => box.intersectsBox(tempBox),
            intersectsTriangle: (tri: Triangle, triIndex: number) => {
              // Exact SAT intersection
              if (tempBox.intersectsTriangle(tri)) {
                hitColor = getTriangleColor(mesh, triIndex);
                return true; // Stop BVH traversal
              }
              return false;
            }
          });

          if (hitColor !== null) break;
        }

        if (hitColor !== null) {
          const key = `${gx},${gy},${gz}`;
          placed.add(key);
          commands.push({
            type: "PLACE",
            key: toKey(gx, gy, gz),
            color: hitColor as HexColor,
          });
        }
      }
    }
  }

  // Cleanup
  for (const mesh of meshes) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((mesh.geometry as any).disposeBoundsTree) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mesh.geometry as any).disposeBoundsTree();
    }
    mesh.geometry.dispose();
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((m) => m.dispose());
    } else {
      mesh.material.dispose();
    }
  }

  textureCanvasCache.clear();
  return commands;
}
