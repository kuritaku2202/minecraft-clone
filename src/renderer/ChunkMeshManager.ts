import * as THREE from 'three';
import { World } from '../engine/World';
import { CHUNK_SIZE } from '../engine/Chunk';
import {
  buildChunkMesh,
  worldSampler,
  type ChunkMeshData,
  type MeshData,
} from '../engine/ChunkMesher';
import { snapshotChunk } from '../engine/chunkSnapshot';
import type { MeshRequest } from '../engine/mesher.worker';
import { createChunkMesh } from './ChunkRenderer';

interface MeshResult {
  id: number;
  cx: number;
  cz: number;
  opaque: MeshData;
  water: MeshData;
}

const POOL_SIZE = Math.min(4, Math.max(1, (navigator.hardwareConcurrency ?? 4) - 1));

/**
 * Owns the Three.js meshes for each chunk (one opaque + one transparent-water
 * mesh) and rebuilds individual chunks so a block edit only re-meshes the
 * affected chunk (plus border neighbours, whose culling depends on the change).
 *
 * Meshing runs on a pool of Web Workers: {@link rebuild} snapshots the chunk's
 * blocks (plus a 1-voxel border) and posts the job; the result is applied when
 * it returns. A synchronous path ({@link rebuildSync}) meshes on the main thread
 * for spawn preload so the player sees ground on the first frame.
 */
export class ChunkMeshManager {
  readonly group = new THREE.Group();
  private readonly meshes = new Map<string, THREE.Mesh>();
  private readonly waterMeshes = new Map<string, THREE.Mesh>();
  private readonly quadCounts = new Map<string, number>();
  private readonly waterQuadCounts = new Map<string, number>();
  /** Chunks whose mesh result has been applied at least once. */
  private readonly built = new Set<string>();
  /** Chunks with an in-flight worker job: key -> latest job id. */
  private readonly pending = new Map<string, number>();

  private readonly workers: Worker[];
  private nextWorker = 0;
  private jobCounter = 0;

  constructor(
    private readonly opaqueMaterial: THREE.Material,
    private readonly waterMaterial: THREE.Material,
  ) {
    this.workers = Array.from({ length: POOL_SIZE }, () => {
      const w = new Worker(new URL('../engine/mesher.worker.ts', import.meta.url), {
        type: 'module',
      });
      w.onmessage = (ev: MessageEvent<MeshResult>) => this.onWorkerResult(ev.data);
      return w;
    });
  }

  private static key(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  isBuilt(cx: number, cz: number): boolean {
    return this.built.has(ChunkMeshManager.key(cx, cz));
  }

  isPending(cx: number, cz: number): boolean {
    return this.pending.has(ChunkMeshManager.key(cx, cz));
  }

  /** Dispatch an async (worker) re-mesh; the old mesh stays until it returns. */
  rebuild(world: World, cx: number, cz: number): void {
    const chunk = world.getChunk(cx, cz);
    if (!chunk) return;
    chunk.dirty = false;

    const id = ++this.jobCounter;
    this.pending.set(ChunkMeshManager.key(cx, cz), id);
    const blocks = snapshotChunk(world, cx, cz);
    const worker = this.workers[this.nextWorker];
    this.nextWorker = (this.nextWorker + 1) % this.workers.length;
    const req: MeshRequest = { id, cx, cz, blocks };
    worker.postMessage(req, [blocks.buffer]);
  }

  /** Synchronously mesh on the main thread (used for spawn preload). */
  rebuildSync(world: World, cx: number, cz: number): void {
    const chunk = world.getChunk(cx, cz);
    if (!chunk) return;
    chunk.dirty = false;
    this.pending.delete(ChunkMeshManager.key(cx, cz)); // cancel any in-flight job
    const data = buildChunkMesh(worldSampler(world, cx, cz));
    this.applyMesh(cx, cz, data);
    this.built.add(ChunkMeshManager.key(cx, cz));
  }

  private onWorkerResult(res: MeshResult): void {
    const key = ChunkMeshManager.key(res.cx, res.cz);
    // Drop stale results: a newer job superseded this one, or the chunk unloaded.
    if (this.pending.get(key) !== res.id) return;
    this.pending.delete(key);
    this.applyMesh(res.cx, res.cz, { opaque: res.opaque, water: res.water });
    this.built.add(key);
  }

  private applyMesh(cx: number, cz: number, data: ChunkMeshData): void {
    const key = ChunkMeshManager.key(cx, cz);
    this.disposeMeshes(key);
    this.addMesh(this.meshes, this.opaqueMaterial, key, cx, cz, data.opaque, 0);
    this.addMesh(this.waterMeshes, this.waterMaterial, key, cx, cz, data.water, 1);
    this.quadCounts.set(key, data.opaque.quadCount);
    this.waterQuadCounts.set(key, data.water.quadCount);
  }

  private addMesh(
    map: Map<string, THREE.Mesh>,
    material: THREE.Material,
    key: string,
    cx: number,
    cz: number,
    md: MeshData,
    renderOrder: number,
  ): void {
    if (md.indices.length === 0) return; // empty pass: no mesh
    const mesh = createChunkMesh(md, material);
    mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
    mesh.renderOrder = renderOrder;
    map.set(key, mesh);
    this.group.add(mesh);
  }

  private disposeMeshes(key: string): void {
    for (const map of [this.meshes, this.waterMeshes]) {
      const mesh = map.get(key);
      if (mesh) {
        this.group.remove(mesh);
        mesh.geometry.dispose();
        map.delete(key);
      }
    }
  }

  /** Dispose the meshes for a chunk and forget it (used when a chunk unloads). */
  remove(cx: number, cz: number): void {
    const key = ChunkMeshManager.key(cx, cz);
    this.disposeMeshes(key);
    this.quadCounts.delete(key);
    this.waterQuadCounts.delete(key);
    this.built.delete(key);
    this.pending.delete(key); // discard any in-flight result
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

  get waterQuads(): number {
    let total = 0;
    for (const c of this.waterQuadCounts.values()) total += c;
    return total;
  }
}
