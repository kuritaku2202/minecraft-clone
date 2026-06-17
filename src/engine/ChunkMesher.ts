import { Chunk, CHUNK_SIZE, CHUNK_HEIGHT } from './Chunk';
import { World } from './World';
import { isOpaque, tileForFace, type FaceKey } from './BlockRegistry';

/**
 * Greedy mesher with per-vertex ambient occlusion (Sprint 4).
 *
 * For each of the 3 axes it sweeps slices, builds a 2D face mask, then merges
 * runs of identical faces (same tile, same direction, same 4 AO values) into
 * large rectangles — drastically cutting vertex count vs. the per-face mesher.
 *
 * Merged quads tile their tile texture via REPEAT-wrapped UVs that exceed 1, so
 * a single layer of the DataArrayTexture repeats once per block.
 *
 * The research document recommends bit-packing the per-vertex attributes
 * (faceId/tileId/AO/light) into one 32-bit integer. We keep them as separate
 * float attributes here for simpler WebGL handling; the packing is a pure
 * bandwidth optimisation that can be layered on without changing the geometry.
 */

export interface MeshData {
  positions: Float32Array;
  uvs: Float32Array;
  layers: Float32Array;
  aos: Float32Array;
  shades: Float32Array;
  indices: Uint32Array;
  quadCount: number;
  vertexCount: number;
}

const DIMS = [CHUNK_SIZE, CHUNK_HEIGHT, CHUNK_SIZE];

// Unit basis vectors per axis index.
const AXIS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

interface FaceEntry {
  tile: number; // texture-array layer
  faceId: number; // 0..5 (for shade + equality)
  shade: number;
  ao: [number, number, number, number]; // corner AO at (0,0)(1,0)(1,1)(0,1)
}

function faceShade(d: number, positive: boolean): number {
  if (d === 1) return positive ? 1.0 : 0.5; // top : bottom
  if (d === 0) return 0.6; // east/west
  return 0.8; // north/south
}

function faceKeyFor(d: number, positive: boolean): FaceKey {
  if (d === 1) return positive ? 'top' : 'bottom';
  return 'side';
}

function entriesEqual(a: FaceEntry | null, b: FaceEntry | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.tile === b.tile &&
    a.faceId === b.faceId &&
    a.ao[0] === b.ao[0] &&
    a.ao[1] === b.ao[1] &&
    a.ao[2] === b.ao[2] &&
    a.ao[3] === b.ao[3]
  );
}

export function buildChunkMesh(chunk: Chunk, world: World): MeshData {
  const baseX = chunk.cx * CHUNK_SIZE;
  const baseZ = chunk.cz * CHUNK_SIZE;

  const opaqueAt = (lx: number, ly: number, lz: number): boolean =>
    isOpaque(world.getBlock(baseX + lx, ly, baseZ + lz));
  const idAt = (lx: number, ly: number, lz: number): number =>
    world.getBlock(baseX + lx, ly, baseZ + lz);

  const positions: number[] = [];
  const uvs: number[] = [];
  const layers: number[] = [];
  const aos: number[] = [];
  const shades: number[] = [];
  const indices: number[] = [];

  const aoForCorner = (
    front: [number, number, number],
    uVec: readonly [number, number, number],
    vVec: readonly [number, number, number],
    du: number,
    dv: number,
  ): number => {
    const s1 = opaqueAt(
      front[0] + uVec[0] * du,
      front[1] + uVec[1] * du,
      front[2] + uVec[2] * du,
    )
      ? 1
      : 0;
    const s2 = opaqueAt(
      front[0] + vVec[0] * dv,
      front[1] + vVec[1] * dv,
      front[2] + vVec[2] * dv,
    )
      ? 1
      : 0;
    const cor = opaqueAt(
      front[0] + uVec[0] * du + vVec[0] * dv,
      front[1] + uVec[1] * du + vVec[1] * dv,
      front[2] + uVec[2] * du + vVec[2] * dv,
    )
      ? 1
      : 0;
    return s1 && s2 ? 0 : 3 - (s1 + s2 + cor);
  };

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    const uVec = AXIS[u];
    const vVec = AXIS[v];
    const maskW = DIMS[u];
    const maskH = DIMS[v];
    const mask: (FaceEntry | null)[] = new Array(maskW * maskH).fill(null);

    const x = [0, 0, 0];

    // Sweep boundary planes between slice s and s+1 along axis d.
    for (let s = -1; s < DIMS[d]; s++) {
      let n = 0;
      for (let j = 0; j < maskH; j++) {
        for (let i = 0; i < maskW; i++) {
          x[d] = s;
          x[u] = i;
          x[v] = j;
          const aPos: [number, number, number] = [x[0], x[1], x[2]];
          const bPos: [number, number, number] = [
            x[0] + AXIS[d][0],
            x[1] + AXIS[d][1],
            x[2] + AXIS[d][2],
          ];
          const aOpaque = opaqueAt(aPos[0], aPos[1], aPos[2]);
          const bOpaque = opaqueAt(bPos[0], bPos[1], bPos[2]);

          let entry: FaceEntry | null = null;
          if (aOpaque !== bOpaque) {
            // The face belongs to the solid cell; its front is the empty cell.
            const positive = aOpaque; // normal points +d when A is solid
            const solid = aOpaque ? aPos : bPos;
            const front = aOpaque ? bPos : aPos;
            const id = idAt(solid[0], solid[1], solid[2]);
            const tile = tileForFace(id, faceKeyFor(d, positive));
            const faceId = d * 2 + (positive ? 0 : 1);
            entry = {
              tile,
              faceId,
              shade: faceShade(d, positive),
              ao: [
                aoForCorner(front, uVec, vVec, -1, -1),
                aoForCorner(front, uVec, vVec, 1, -1),
                aoForCorner(front, uVec, vVec, 1, 1),
                aoForCorner(front, uVec, vVec, -1, 1),
              ],
            };
          }
          mask[n++] = entry;
        }
      }

      // Greedy merge of the mask into rectangles.
      const sliceCoord = s + 1; // boundary plane lies at d = s+1
      for (let j = 0; j < maskH; j++) {
        for (let i = 0; i < maskW; ) {
          const e = mask[j * maskW + i];
          if (e === null) {
            i++;
            continue;
          }

          // Width.
          let w = 1;
          while (i + w < maskW && entriesEqual(mask[j * maskW + i + w], e)) w++;

          // Height.
          let h = 1;
          outer: while (j + h < maskH) {
            for (let k = 0; k < w; k++) {
              if (!entriesEqual(mask[(j + h) * maskW + i + k], e)) break outer;
            }
            h++;
          }

          emitQuad(
            positions,
            uvs,
            layers,
            aos,
            shades,
            indices,
            d,
            u,
            v,
            sliceCoord,
            i,
            j,
            w,
            h,
            e,
            baseX,
            baseZ,
          );

          for (let dj = 0; dj < h; dj++) {
            for (let di = 0; di < w; di++) {
              mask[(j + dj) * maskW + i + di] = null;
            }
          }
          i += w;
        }
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    uvs: new Float32Array(uvs),
    layers: new Float32Array(layers),
    aos: new Float32Array(aos),
    shades: new Float32Array(shades),
    indices: new Uint32Array(indices),
    quadCount: indices.length / 6,
    vertexCount: positions.length / 3,
  };
}

function emitQuad(
  positions: number[],
  uvs: number[],
  layers: number[],
  aos: number[],
  shades: number[],
  indices: number[],
  d: number,
  u: number,
  v: number,
  sliceCoord: number,
  uStart: number,
  vStart: number,
  w: number,
  h: number,
  e: FaceEntry,
  baseX: number,
  baseZ: number,
): void {
  const positive = e.faceId % 2 === 0;

  // Build the 4 corners (u,v) = (0,0),(w,0),(w,h),(0,h).
  const corner = (uOff: number, vOff: number): [number, number, number] => {
    const p = [0, 0, 0];
    p[d] = sliceCoord;
    p[u] = uStart + uOff;
    p[v] = vStart + vOff;
    return [p[0] + baseX, p[1], p[2] + baseZ];
  };
  const c0 = corner(0, 0);
  const c1 = corner(w, 0);
  const c2 = corner(w, h);
  const c3 = corner(0, h);

  // UVs: keep world-Y on the texture T axis so side tiles stay upright.
  let uv0: [number, number];
  let uv1: [number, number];
  let uv2: [number, number];
  let uv3: [number, number];
  if (u === 1) {
    // u axis is Y: S follows v-extent, T follows u-extent.
    uv0 = [0, 0];
    uv1 = [0, w];
    uv2 = [h, w];
    uv3 = [h, 0];
  } else if (v === 1) {
    // v axis is Y: S follows u-extent, T follows v-extent.
    uv0 = [0, 0];
    uv1 = [w, 0];
    uv2 = [w, h];
    uv3 = [0, h];
  } else {
    // Top/bottom: orientation irrelevant.
    uv0 = [0, 0];
    uv1 = [w, 0];
    uv2 = [w, h];
    uv3 = [0, h];
  }

  const base = positions.length / 3;
  const push = (
    c: [number, number, number],
    uv: [number, number],
    aoVal: number,
  ): void => {
    positions.push(c[0], c[1], c[2]);
    uvs.push(uv[0], uv[1]);
    layers.push(e.tile);
    aos.push(aoVal);
    shades.push(e.shade);
  };
  push(c0, uv0, e.ao[0]);
  push(c1, uv1, e.ao[1]);
  push(c2, uv2, e.ao[2]);
  push(c3, uv3, e.ao[3]);

  // Flip the triangulation diagonal when AO is asymmetric (anisotropy fix).
  const flip = e.ao[0] + e.ao[2] < e.ao[1] + e.ao[3];

  if (positive) {
    if (flip) {
      indices.push(base + 1, base + 2, base + 3, base + 1, base + 3, base + 0);
    } else {
      indices.push(base + 0, base + 1, base + 2, base + 0, base + 2, base + 3);
    }
  } else {
    if (flip) {
      indices.push(base + 1, base + 3, base + 2, base + 1, base + 0, base + 3);
    } else {
      indices.push(base + 0, base + 2, base + 1, base + 0, base + 3, base + 2);
    }
  }
}

/** Count visible (culled) faces without merging — used to report greedy savings. */
export function countVisibleFaces(chunk: Chunk, world: World): number {
  const baseX = chunk.cx * CHUNK_SIZE;
  const baseZ = chunk.cz * CHUNK_SIZE;
  let count = 0;
  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        if (!isOpaque(world.getBlock(baseX + lx, y, baseZ + z))) continue;
        for (const [dx, dy, dz] of AXIS) {
          if (!isOpaque(world.getBlock(baseX + lx + dx, y + dy, baseZ + z + dz)))
            count++;
          if (!isOpaque(world.getBlock(baseX + lx - dx, y - dy, baseZ + z - dz)))
            count++;
        }
      }
    }
  }
  return count;
}
