import { createNoise2D, createNoise3D } from 'simplex-noise';
import { Chunk, CHUNK_SIZE } from '../engine/Chunk';
import { BlockId } from '../engine/BlockRegistry';

export const SEA_LEVEL = 62;
/** Surfaces above this height get a snow cap instead of grass. */
export const SNOW_LINE = SEA_LEVEL + 22;

type Noise2D = (x: number, y: number) => number;
type Noise3D = (x: number, y: number, z: number) => number;

/** Deterministic PRNG so a seed reproduces the same world. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fbm2(noise: Noise2D, x: number, z: number, octaves: number): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(x * freq, z * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

function fbm3(
  noise: Noise3D,
  x: number,
  y: number,
  z: number,
  octaves: number,
): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(x * freq, y * freq, z * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/**
 * Seeded terrain generation combining three 2D climate noises into a surface
 * height (the research document's continentalness / erosion / weirdness idea),
 * then layering grass/dirt/stone, filling oceans up to sea level, and carving
 * 3D caves underground.
 */
export class TerrainGenerator {
  private readonly continent: Noise2D;
  private readonly erosion: Noise2D;
  private readonly hills: Noise2D;
  private readonly cave: Noise3D;
  private readonly feature: Noise3D; // ore / gravel blobs underground

  constructor(readonly seed: number) {
    const rng = mulberry32(seed);
    // Each create* call advances the rng, giving independent noise fields.
    // `feature` is created last so adding it leaves the earlier fields (and thus
    // the world's height/caves) byte-for-byte unchanged for a given seed.
    this.continent = createNoise2D(rng);
    this.erosion = createNoise2D(rng);
    this.hills = createNoise2D(rng);
    this.cave = createNoise3D(rng);
    this.feature = createNoise3D(rng);
  }

  /** Deterministic, seed-mixed integer hash → [0,1). */
  private hash(x: number, y: number, z: number): number {
    let h = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (this.seed * 2654435761);
    h = Math.imul(h ^ (h >>> 13), 0x85ebca6b);
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967296;
  }

  /** Underground material for a stone cell: ore / gravel blobs, else stone. */
  private stoneMaterial(wx: number, y: number, wz: number): BlockId {
    const nf = fbm3(this.feature, wx * 0.09, y * 0.09, wz * 0.09, 2);
    if (nf > 0.72) return BlockId.IronOre; // dense cores, rarest
    if (nf > 0.55) return BlockId.CoalOre; // broader shells, common
    if (nf < -0.8) return BlockId.Gravel; // separate low-noise blobs
    return BlockId.Stone;
  }

  /** Surface height (top solid block) at a world column. */
  heightAt(wx: number, wz: number): number {
    const c = fbm2(this.continent, wx * 0.0016, wz * 0.0016, 4); // broad land/ocean
    const e = fbm2(this.erosion, wx * 0.006, wz * 0.006, 3); // flatness
    const h = fbm2(this.hills, wx * 0.012, wz * 0.012, 4); // local relief

    // Bias slightly above sea level so land is the majority but oceans remain.
    let terrain = SEA_LEVEL + 8 + c * 22; // oceans (~48) to highlands (~92)
    const hilliness = (1 - Math.abs(e)) * 24; // |e|~0 → hilly, |e|~1 → flat plains
    terrain += h * hilliness;
    return Math.floor(terrain);
  }

  private isCave(wx: number, y: number, wz: number): boolean {
    const n = fbm3(this.cave, wx * 0.05, y * 0.06, wz * 0.05, 2);
    return n > 0.55;
  }

  generate(chunk: Chunk): void {
    const baseX = chunk.cx * CHUNK_SIZE;
    const baseZ = chunk.cz * CHUNK_SIZE;

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = baseX + lx;
        const wz = baseZ + lz;
        const height = this.heightAt(wx, wz);
        const top = Math.max(height, SEA_LEVEL);

        for (let y = 0; y <= top; y++) {
          let id: BlockId = BlockId.Air;

          if (y <= height) {
            const depth = height - y;
            if (depth === 0) {
              // Surface: snow on peaks, grass on land, sand near the shoreline.
              id =
                height > SNOW_LINE
                  ? BlockId.Snow
                  : height >= SEA_LEVEL + 1
                    ? BlockId.Grass
                    : height >= SEA_LEVEL - 2
                      ? BlockId.Sand
                      : BlockId.Dirt;
            } else if (depth <= 3) {
              id = BlockId.Dirt;
            } else {
              // Deep stone: scatter ore / gravel blobs via the feature noise.
              id = this.stoneMaterial(wx, y, wz);
            }

            // Carve caves below the surface skin.
            if (y > 3 && depth > 2 && this.isCave(wx, y, wz)) {
              id = BlockId.Air;
            }

            // Indestructible bedrock floor (overrides caves/ore at the bottom).
            if (y === 0 || (y <= 2 && this.hash(wx, y, wz) < 0.55 - y * 0.18)) {
              id = BlockId.Bedrock;
            }
          } else if (y <= SEA_LEVEL) {
            id = BlockId.Water;
          }

          if (id !== BlockId.Air) chunk.set(lx, y, lz, id);
        }
      }
    }

    this.plantTrees(chunk, baseX, baseZ);
  }

  /**
   * Plant small oak trees on grass. Trees are kept fully inside the chunk
   * (trunk in local x/z 2..13) so the leaf canopy never crosses a chunk border —
   * this keeps generation per-chunk and deterministic without neighbour writes.
   */
  private plantTrees(chunk: Chunk, baseX: number, baseZ: number): void {
    for (let lx = 2; lx <= CHUNK_SIZE - 3; lx++) {
      for (let lz = 2; lz <= CHUNK_SIZE - 3; lz++) {
        const wx = baseX + lx;
        const wz = baseZ + lz;
        const height = this.heightAt(wx, wz);
        if (height < SEA_LEVEL + 1) continue; // no trees underwater / on beach
        if (chunk.get(lx, height, lz) !== BlockId.Grass) continue; // grass only
        if (this.hash(wx, 7, wz) > 0.022) continue; // ~2.2% of grass columns

        const trunkH = 4 + Math.floor(this.hash(wx, 11, wz) * 3); // 4..6
        const baseY = height + 1;
        const topTrunk = baseY + trunkH - 1;

        // Leaf canopy: two wide layers around the top, a 3×3 cap, then a cross.
        this.leafLayer(chunk, lx, lz, topTrunk - 1, 2);
        this.leafLayer(chunk, lx, lz, topTrunk, 2);
        this.leafLayer(chunk, lx, lz, topTrunk + 1, 1);
        this.leafCross(chunk, lx, lz, topTrunk + 2);

        // Trunk last so logs sit in front of any overlapping leaf cells.
        for (let y = baseY; y <= topTrunk; y++) {
          chunk.set(lx, y, lz, BlockId.OakLog);
        }
      }
    }
  }

  private leafLayer(
    chunk: Chunk,
    lx: number,
    lz: number,
    y: number,
    radius: number,
  ): void {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        // Trim the 4 outer corners of the widest layers for a rounder shape.
        if (radius === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
        if (chunk.get(lx + dx, y, lz + dz) === BlockId.Air) {
          chunk.set(lx + dx, y, lz + dz, BlockId.OakLeaves);
        }
      }
    }
  }

  private leafCross(chunk: Chunk, lx: number, lz: number, y: number): void {
    const cells: ReadonlyArray<readonly [number, number]> = [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    for (const [dx, dz] of cells) {
      if (chunk.get(lx + dx, y, lz + dz) === BlockId.Air) {
        chunk.set(lx + dx, y, lz + dz, BlockId.OakLeaves);
      }
    }
  }
}
