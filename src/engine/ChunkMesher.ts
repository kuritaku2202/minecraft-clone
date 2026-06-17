import { Chunk, CHUNK_SIZE, CHUNK_HEIGHT } from './Chunk';
import { World } from './World';
import { isOpaque, tileForFace, type FaceKey } from './BlockRegistry';
import { tileRect } from './textures';

/**
 * Sprint 1 mesher: hidden-face culling only (no greedy merging yet — that
 * arrives in Sprint 4). For every opaque voxel it emits a quad per face whose
 * neighbour is non-opaque. Neighbours are queried through the World so faces on
 * chunk borders are correctly culled against adjacent chunks.
 *
 * Per-face directional shading is baked into vertex colours (Minecraft-style:
 * top brightest, bottom darkest) which makes voxel boundaries legible without
 * real-time lighting.
 */

interface Face {
  dir: readonly [number, number, number];
  /** Corner positions (0/1 within the voxel) and tile-local UVs. */
  corners: ReadonlyArray<{ pos: readonly [number, number, number]; uv: readonly [number, number] }>;
  faceKey: FaceKey;
  shade: number;
}

// Canonical culled-voxel face table (CCW outward winding, FrontSide culling).
const FACES: readonly Face[] = [
  {
    // -X (west)
    dir: [-1, 0, 0],
    faceKey: 'side',
    shade: 0.6,
    corners: [
      { pos: [0, 1, 0], uv: [0, 1] },
      { pos: [0, 0, 0], uv: [0, 0] },
      { pos: [0, 1, 1], uv: [1, 1] },
      { pos: [0, 0, 1], uv: [1, 0] },
    ],
  },
  {
    // +X (east)
    dir: [1, 0, 0],
    faceKey: 'side',
    shade: 0.6,
    corners: [
      { pos: [1, 1, 1], uv: [0, 1] },
      { pos: [1, 0, 1], uv: [0, 0] },
      { pos: [1, 1, 0], uv: [1, 1] },
      { pos: [1, 0, 0], uv: [1, 0] },
    ],
  },
  {
    // -Y (bottom)
    dir: [0, -1, 0],
    faceKey: 'bottom',
    shade: 0.5,
    corners: [
      { pos: [1, 0, 1], uv: [1, 0] },
      { pos: [0, 0, 1], uv: [0, 0] },
      { pos: [1, 0, 0], uv: [1, 1] },
      { pos: [0, 0, 0], uv: [0, 1] },
    ],
  },
  {
    // +Y (top)
    dir: [0, 1, 0],
    faceKey: 'top',
    shade: 1.0,
    corners: [
      { pos: [0, 1, 1], uv: [1, 1] },
      { pos: [1, 1, 1], uv: [0, 1] },
      { pos: [0, 1, 0], uv: [1, 0] },
      { pos: [1, 1, 0], uv: [0, 0] },
    ],
  },
  {
    // -Z (north)
    dir: [0, 0, -1],
    faceKey: 'side',
    shade: 0.8,
    corners: [
      { pos: [1, 0, 0], uv: [0, 0] },
      { pos: [0, 0, 0], uv: [1, 0] },
      { pos: [1, 1, 0], uv: [0, 1] },
      { pos: [0, 1, 0], uv: [1, 1] },
    ],
  },
  {
    // +Z (south)
    dir: [0, 0, 1],
    faceKey: 'side',
    shade: 0.8,
    corners: [
      { pos: [0, 0, 1], uv: [0, 0] },
      { pos: [1, 0, 1], uv: [1, 0] },
      { pos: [0, 1, 1], uv: [0, 1] },
      { pos: [1, 1, 1], uv: [1, 1] },
    ],
  },
];

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  quadCount: number;
}

export function buildChunkMesh(chunk: Chunk, world: World): MeshData {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const baseX = chunk.cx * CHUNK_SIZE;
  const baseZ = chunk.cz * CHUNK_SIZE;

  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const id = chunk.get(x, y, z);
        if (!isOpaque(id)) continue; // air / transparent: nothing to draw

        const wx = baseX + x;
        const wy = y;
        const wz = baseZ + z;

        for (const face of FACES) {
          const neighbour = world.getBlock(
            wx + face.dir[0],
            wy + face.dir[1],
            wz + face.dir[2],
          );
          if (isOpaque(neighbour)) continue; // hidden: cull this face

          const rect = tileRect(tileForFace(id, face.faceKey));
          const base = positions.length / 3;

          for (const corner of face.corners) {
            positions.push(
              wx + corner.pos[0],
              wy + corner.pos[1],
              wz + corner.pos[2],
            );
            normals.push(face.dir[0], face.dir[1], face.dir[2]);
            uvs.push(
              rect.u0 + corner.uv[0] * (rect.u1 - rect.u0),
              rect.v0 + corner.uv[1] * (rect.v1 - rect.v0),
            );
            colors.push(face.shade, face.shade, face.shade);
          }

          indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
        }
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    colors: new Float32Array(colors),
    indices: new Uint32Array(indices),
    quadCount: indices.length / 6,
  };
}
