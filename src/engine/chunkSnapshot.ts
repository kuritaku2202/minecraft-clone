import { CHUNK_SIZE, CHUNK_HEIGHT } from './Chunk';
import { World } from './World';
import type { BlockSampler } from './ChunkMesher';

/**
 * A chunk's block data plus a 1-voxel border into its neighbours, flattened into
 * a transferable Uint8Array. The mesher samples local coords in -1..CHUNK_SIZE
 * (X/Z) and -1..CHUNK_HEIGHT (Y) for face culling and ambient occlusion, so the
 * snapshot is padded by one voxel on every side. Used to hand a self-contained
 * meshing job to a Web Worker.
 */

const SNAP_X = CHUNK_SIZE + 2;
const SNAP_Z = CHUNK_SIZE + 2;
const SNAP_Y = CHUNK_HEIGHT + 2;
const SNAP_VOLUME = SNAP_X * SNAP_Y * SNAP_Z;

/** Flat index for padded local coords (lx,lz in -1..16, ly in -1..256). */
function snapIndex(lx: number, ly: number, lz: number): number {
  return lx + 1 + SNAP_X * (lz + 1 + SNAP_Z * (ly + 1));
}

export function snapshotChunk(world: World, cx: number, cz: number): Uint8Array {
  const baseX = cx * CHUNK_SIZE;
  const baseZ = cz * CHUNK_SIZE;
  const blocks = new Uint8Array(SNAP_VOLUME);
  for (let ly = -1; ly <= CHUNK_HEIGHT; ly++) {
    for (let lz = -1; lz <= CHUNK_SIZE; lz++) {
      for (let lx = -1; lx <= CHUNK_SIZE; lx++) {
        const id = world.getBlock(baseX + lx, ly, baseZ + lz);
        if (id !== 0) blocks[snapIndex(lx, ly, lz)] = id;
      }
    }
  }
  return blocks;
}

/** A {@link BlockSampler} backed by a padded snapshot (runs inside the worker). */
export function snapshotSampler(blocks: Uint8Array): BlockSampler {
  return (lx, ly, lz) => blocks[snapIndex(lx, ly, lz)];
}
