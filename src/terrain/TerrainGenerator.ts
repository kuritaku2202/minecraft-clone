import { createNoise2D, createNoise3D } from 'simplex-noise';
import { Chunk, CHUNK_SIZE } from '../engine/Chunk';
import { BlockId } from '../engine/BlockRegistry';

export const SEA_LEVEL = 62;

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

  constructor(readonly seed: number) {
    const rng = mulberry32(seed);
    // Each create* call advances the rng, giving independent noise fields.
    this.continent = createNoise2D(rng);
    this.erosion = createNoise2D(rng);
    this.hills = createNoise2D(rng);
    this.cave = createNoise3D(rng);
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
              // Surface: grass on land, sand near/under the shoreline.
              id =
                height >= SEA_LEVEL + 1
                  ? BlockId.Grass
                  : height >= SEA_LEVEL - 2
                    ? BlockId.Sand
                    : BlockId.Dirt;
            } else if (depth <= 3) {
              id = BlockId.Dirt;
            } else {
              id = BlockId.Stone;
            }

            // Carve caves below the surface skin, leaving a bedrock floor.
            if (y > 3 && depth > 2 && this.isCave(wx, y, wz)) {
              id = BlockId.Air;
            }
          } else if (y <= SEA_LEVEL) {
            id = BlockId.Water;
          }

          if (id !== BlockId.Air) chunk.set(lx, y, lz, id);
        }
      }
    }
  }
}
