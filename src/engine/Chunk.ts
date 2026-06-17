import { BlockId } from './BlockRegistry';

/** Horizontal chunk footprint in blocks (X and Z). */
export const CHUNK_SIZE = 16;
/** Vertical world height in blocks. */
export const CHUNK_HEIGHT = 256;

const VOLUME = CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE;

/**
 * A 16 x 256 x 16 column of voxels. Block ids are packed into a flat
 * Uint8Array indexed as x + SIZE*(z + SIZE*y).
 */
export class Chunk {
  readonly cx: number;
  readonly cz: number;
  readonly blocks: Uint8Array;
  /** Bumped whenever block data changes so renderers can rebuild meshes. */
  dirty = true;

  constructor(cx: number, cz: number) {
    this.cx = cx;
    this.cz = cz;
    this.blocks = new Uint8Array(VOLUME);
  }

  static index(x: number, y: number, z: number): number {
    return x + CHUNK_SIZE * (z + CHUNK_SIZE * y);
  }

  static inBounds(x: number, y: number, z: number): boolean {
    return (
      x >= 0 &&
      x < CHUNK_SIZE &&
      z >= 0 &&
      z < CHUNK_SIZE &&
      y >= 0 &&
      y < CHUNK_HEIGHT
    );
  }

  /** Local-coordinate block read. Out-of-range returns Air. */
  get(x: number, y: number, z: number): number {
    if (!Chunk.inBounds(x, y, z)) return BlockId.Air;
    return this.blocks[Chunk.index(x, y, z)];
  }

  /** Local-coordinate block write. Out-of-range is ignored. */
  set(x: number, y: number, z: number, id: number): void {
    if (!Chunk.inBounds(x, y, z)) return;
    this.blocks[Chunk.index(x, y, z)] = id;
    this.dirty = true;
  }
}
