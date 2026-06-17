import { Chunk, CHUNK_SIZE, CHUNK_HEIGHT } from './Chunk';
import { BlockId } from './BlockRegistry';

/**
 * Holds the loaded chunks and exposes world-space block access. The mesher
 * uses {@link getBlock} so it can cull faces that border neighbouring chunks.
 */
export class World {
  readonly chunks = new Map<string, Chunk>();

  private static key(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(World.key(cx, cz));
  }

  getOrCreateChunk(cx: number, cz: number): Chunk {
    let chunk = this.getChunk(cx, cz);
    if (!chunk) {
      chunk = new Chunk(cx, cz);
      this.chunks.set(World.key(cx, cz), chunk);
    }
    return chunk;
  }

  getBlock(wx: number, wy: number, wz: number): number {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return BlockId.Air;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return BlockId.Air;
    return chunk.get(wx - cx * CHUNK_SIZE, wy, wz - cz * CHUNK_SIZE);
  }

  setBlock(wx: number, wy: number, wz: number, id: number): void {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.getOrCreateChunk(cx, cz);
    chunk.set(wx - cx * CHUNK_SIZE, wy, wz - cz * CHUNK_SIZE, id);
  }
}

/**
 * Sprint 1 placeholder world generation: a perfectly flat terrain.
 *   y = 65        grass
 *   y = 62..64    dirt
 *   y = 50..61    stone
 * Replaced by noise-based generation in Sprint 6.
 */
export function generateFlatChunk(chunk: Chunk): void {
  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let y = 50; y <= 65; y++) {
        let id: BlockId;
        if (y === 65) id = BlockId.Grass;
        else if (y >= 62) id = BlockId.Dirt;
        else id = BlockId.Stone;
        chunk.set(x, y, z, id);
      }
    }
  }
}
