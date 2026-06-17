import * as THREE from 'three';
import { World } from '../engine/World';
import { CHUNK_SIZE } from '../engine/Chunk';
import { buildChunkMesh } from '../engine/ChunkMesher';
import { createChunkMesh } from './ChunkRenderer';

/**
 * Owns one Three.js mesh per chunk and supports rebuilding individual chunks so
 * a block edit only re-meshes the affected chunk (plus border neighbours, whose
 * culling depends on the changed block).
 */
export class ChunkMeshManager {
  readonly group = new THREE.Group();
  private readonly meshes = new Map<string, THREE.Mesh>();
  private readonly quadCounts = new Map<string, number>();

  constructor(private readonly material: THREE.Material) {}

  private static key(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  rebuild(world: World, cx: number, cz: number): void {
    const key = ChunkMeshManager.key(cx, cz);
    const old = this.meshes.get(key);
    if (old) {
      this.group.remove(old);
      old.geometry.dispose();
      this.meshes.delete(key);
    }
    this.quadCounts.delete(key);

    const chunk = world.getChunk(cx, cz);
    if (!chunk) return;

    const data = buildChunkMesh(chunk, world);
    chunk.dirty = false;
    if (data.indices.length === 0) return; // fully empty chunk: no mesh

    const mesh = createChunkMesh(data, this.material);
    this.meshes.set(key, mesh);
    this.quadCounts.set(key, data.quadCount);
    this.group.add(mesh);
  }

  rebuildAll(world: World): void {
    for (const chunk of world.chunks.values()) {
      this.rebuild(world, chunk.cx, chunk.cz);
    }
  }

  /** Rebuild the chunk containing a block plus any border neighbour it touches. */
  markBlockDirty(world: World, wx: number, _wy: number, wz: number): void {
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    this.rebuild(world, cx, cz);

    const lx = wx - cx * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    if (lx === 0) this.rebuild(world, cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this.rebuild(world, cx + 1, cz);
    if (lz === 0) this.rebuild(world, cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.rebuild(world, cx, cz + 1);
  }

  get meshCount(): number {
    return this.meshes.size;
  }

  get totalQuads(): number {
    let total = 0;
    for (const c of this.quadCounts.values()) total += c;
    return total;
  }
}
