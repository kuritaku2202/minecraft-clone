import { Chunk, CHUNK_SIZE, CHUNK_HEIGHT } from './Chunk';
import { World } from './World';
import { BlockId, isOpaque, tileForFace, type FaceKey } from './BlockRegistry';

/**
 * Greedy mesher with per-vertex ambient occlusion (Sprint 4), bit-packed vertex
 * data and a transparent water pass (Sprint 8).
 *
 * For each of the 3 axes it sweeps slices, builds a 2D face mask, then merges
 * runs of identical faces (same tile, same direction, same 4 AO values) into
 * large rectangles — drastically cutting vertex count vs. the per-face mesher.
 *
 * Each vertex is packed into a single 32-bit integer (chunk-LOCAL coords):
 *
 *   bits  0..4   localX (5)   0..16   quad corners (<= CHUNK_SIZE)
 *   bits  5..13  localY (9)   0..256  quad corners (<= CHUNK_HEIGHT)
 *   bits 14..18  localZ (5)   0..16
 *   bits 19..21  faceId (3)   0..5
 *   bits 22..23  ao     (2)   0..3
 *   bits 24..31  tile   (8)   0..255  texture-array layer
 *
 * UV and shade are NOT stored: the vertex shader derives them from the unpacked
 * local position + faceId (REPEAT-wrapped UVs tile per block; shade is a
 * per-face constant). The mesh is emitted in chunk-local space and translated by
 * the renderer, which keeps positions inside the 5/9/5-bit budget.
 *
 * Two passes share the sweep: an opaque pass (terrain) and a water pass (the
 * semi-transparent water surface against air). Block access goes through an
 * injected {@link BlockSampler} so the mesher can run on the main thread or in a
 * Web Worker over a transferred snapshot.
 */

export interface MeshData {
  /** One packed uint32 per vertex (see the bit layout above). */
  data: Uint32Array;
  indices: Uint32Array;
  quadCount: number;
  vertexCount: number;
  /** Local Y extent of the emitted geometry, for a tight bounding sphere. */
  yMin: number;
  yMax: number;
}

export interface ChunkMeshData {
  opaque: MeshData;
  water: MeshData;
}

/** Reads a block id at chunk-local coords, which may range -1..CHUNK_SIZE etc. */
export type BlockSampler = (lx: number, ly: number, lz: number) => number;

const DIMS = [CHUNK_SIZE, CHUNK_HEIGHT, CHUNK_SIZE];

// Unit basis vectors per axis index.
const AXIS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

interface FaceEntry {
  tile: number; // texture-array layer
  faceId: number; // 0..5 (for shade + equality), d*2 + (positive?0:1)
  ao: [number, number, number, number]; // corner AO at (0,0)(1,0)(1,1)(0,1)
}

/** Decides whether a face exists at the boundary between cells A and B. */
type Classifier = (
  d: number,
  uVec: readonly [number, number, number],
  vVec: readonly [number, number, number],
  aPos: [number, number, number],
  bPos: [number, number, number],
) => FaceEntry | null;

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

/** Build a sampler that reads directly from the loaded world (main thread). */
export function worldSampler(world: World, cx: number, cz: number): BlockSampler {
  const baseX = cx * CHUNK_SIZE;
  const baseZ = cz * CHUNK_SIZE;
  return (lx, ly, lz) => world.getBlock(baseX + lx, ly, baseZ + lz);
}

export function buildChunkMesh(sample: BlockSampler): ChunkMeshData {
  const opaqueAt = (lx: number, ly: number, lz: number): boolean =>
    isOpaque(sample(lx, ly, lz));

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

  // Opaque terrain: a face exists where opacity differs; it belongs to the solid
  // cell, faces the empty cell, and carries 4-corner AO.
  const classifyOpaque: Classifier = (d, uVec, vVec, aPos, bPos) => {
    const aOpaque = opaqueAt(aPos[0], aPos[1], aPos[2]);
    const bOpaque = opaqueAt(bPos[0], bPos[1], bPos[2]);
    if (aOpaque === bOpaque) return null;
    const positive = aOpaque; // normal points +d when A is solid
    const solid = aOpaque ? aPos : bPos;
    const front = aOpaque ? bPos : aPos;
    const id = sample(solid[0], solid[1], solid[2]);
    return {
      tile: tileForFace(id, faceKeyFor(d, positive)),
      faceId: d * 2 + (positive ? 0 : 1),
      ao: [
        aoForCorner(front, uVec, vVec, -1, -1),
        aoForCorner(front, uVec, vVec, 1, -1),
        aoForCorner(front, uVec, vVec, 1, 1),
        aoForCorner(front, uVec, vVec, -1, 1),
      ],
    };
  };

  // Water surface: a face exists only where water borders air (water/solid is
  // hidden by terrain; water/water is internal). Flat AO — water gets no
  // occlusion shading.
  const classifyWater: Classifier = (d, _uVec, _vVec, aPos, bPos) => {
    const aId = sample(aPos[0], aPos[1], aPos[2]);
    const bId = sample(bPos[0], bPos[1], bPos[2]);
    const aWater = aId === BlockId.Water;
    const bWater = bId === BlockId.Water;
    if (aWater === bWater) return null;
    const other = aWater ? bId : aId;
    if (other !== BlockId.Air) return null;
    const positive = aWater; // normal points +d (toward air) when A is water
    return {
      tile: tileForFace(BlockId.Water, faceKeyFor(d, positive)),
      faceId: d * 2 + (positive ? 0 : 1),
      ao: [3, 3, 3, 3],
    };
  };

  return {
    opaque: meshPass(classifyOpaque),
    water: meshPass(classifyWater),
  };
}

function meshPass(classify: Classifier): MeshData {
  const data: number[] = [];
  const indices: number[] = [];
  const bounds = { yMin: CHUNK_HEIGHT, yMax: 0 };

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
          mask[n++] = classify(d, uVec, vVec, aPos, bPos);
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

          emitQuad(data, indices, bounds, d, u, v, sliceCoord, i, j, w, h, e);

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
    data: new Uint32Array(data),
    indices: new Uint32Array(indices),
    quadCount: indices.length / 6,
    vertexCount: data.length,
    yMin: bounds.yMin,
    yMax: bounds.yMax,
  };
}

function emitQuad(
  data: number[],
  indices: number[],
  bounds: { yMin: number; yMax: number },
  d: number,
  u: number,
  v: number,
  sliceCoord: number,
  uStart: number,
  vStart: number,
  w: number,
  h: number,
  e: FaceEntry,
): void {
  const positive = e.faceId % 2 === 0;

  // Build the 4 corners (u,v) = (0,0),(w,0),(w,h),(0,h) in chunk-local space.
  const corner = (uOff: number, vOff: number): [number, number, number] => {
    const p = [0, 0, 0];
    p[d] = sliceCoord;
    p[u] = uStart + uOff;
    p[v] = vStart + vOff;
    return [p[0], p[1], p[2]];
  };
  const c0 = corner(0, 0);
  const c1 = corner(w, 0);
  const c2 = corner(w, h);
  const c3 = corner(0, h);

  const base = data.length;
  const push = (c: [number, number, number], aoVal: number): void => {
    if (c[1] < bounds.yMin) bounds.yMin = c[1];
    if (c[1] > bounds.yMax) bounds.yMax = c[1];
    // Pack: x(5) | y(9) | z(5) | faceId(3) | ao(2) | tile(8).
    data.push(
      (c[0] |
        (c[1] << 5) |
        (c[2] << 14) |
        (e.faceId << 19) |
        (aoVal << 22) |
        (e.tile << 24)) >>>
        0,
    );
  };
  push(c0, e.ao[0]);
  push(c1, e.ao[1]);
  push(c2, e.ao[2]);
  push(c3, e.ao[3]);

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
