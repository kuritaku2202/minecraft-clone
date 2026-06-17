/// <reference lib="webworker" />
import { buildChunkMesh } from './ChunkMesher';
import { snapshotSampler } from './chunkSnapshot';

/**
 * Off-thread chunk meshing. Receives a padded block snapshot (see
 * chunkSnapshot.ts), runs the pure greedy mesher, and transfers the packed
 * opaque + water buffers back to the main thread.
 */

export interface MeshRequest {
  id: number;
  cx: number;
  cz: number;
  blocks: Uint8Array;
}

const ctx = self as unknown as Worker;

ctx.onmessage = (ev: MessageEvent<MeshRequest>) => {
  const { id, cx, cz, blocks } = ev.data;
  const { opaque, water } = buildChunkMesh(snapshotSampler(blocks));
  ctx.postMessage({ id, cx, cz, opaque, water }, [
    opaque.data.buffer,
    opaque.indices.buffer,
    water.data.buffer,
    water.indices.buffer,
  ]);
};
