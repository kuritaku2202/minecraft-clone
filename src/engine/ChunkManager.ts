import { World } from './World';
import { Chunk, CHUNK_SIZE } from './Chunk';
import { ChunkMeshManager } from '../renderer/ChunkMeshManager';
import { BlockId } from './BlockRegistry';

/** Fills a freshly created chunk with block data (terrain generation). */
export type ChunkGenerator = (chunk: Chunk) => void;

export type BlockEditListener = (
  x: number,
  y: number,
  z: number,
  id: BlockId,
) => void;

interface Offset {
  dx: number;
  dz: number;
  dist: number;
}

/**
 * Streams chunks around the player: generates block data within
 * renderDistance+1, meshes within renderDistance (only once every neighbour is
 * generated so cross-chunk culling/AO are correct), and unloads chunks that
 * fall outside the keep radius. Work is frame-budgeted to avoid stalls.
 *
 * Streaming meshing is dispatched to a Web-Worker pool (see ChunkMeshManager);
 * the per-frame budget limits dispatches, not completions. Spawn preload meshes
 * synchronously so the player sees ground on the first frame.
 */
export class ChunkManager {
  renderDistance = 8;
  // Conservative per-frame budgets keep the worst-case streaming frame cheap so
  // FPS stays smooth even when crossing into a fresh region quickly.
  genBudgetPerFrame = 4;
  meshBudgetPerFrame = 2;
  unloadBudgetPerFrame = 6;

  private readonly offsets: Offset[];
  private readonly listeners: BlockEditListener[] = [];

  constructor(
    private readonly world: World,
    private readonly meshMgr: ChunkMeshManager,
    private readonly generate: ChunkGenerator,
  ) {
    this.offsets = ChunkManager.computeOffsets(this.renderDistance + 1);
  }

  private generateChunk(cx: number, cz: number): void {
    this.generate(this.world.getOrCreateChunk(cx, cz));
  }

  private static computeOffsets(r: number): Offset[] {
    const offsets: Offset[] = [];
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        offsets.push({ dx, dz, dist: Math.hypot(dx, dz) });
      }
    }
    offsets.sort((a, b) => a.dist - b.dist); // nearest-first
    return offsets;
  }

  onBlockEdit(listener: BlockEditListener): void {
    this.listeners.push(listener);
  }

  /** Single entry point for block edits: write, re-mesh, notify listeners. */
  editBlock(x: number, y: number, z: number, id: BlockId): void {
    this.world.setBlock(x, y, z, id);
    this.meshMgr.markBlockDirty(this.world, x, y, z);
    for (const l of this.listeners) l(x, y, z, id);
  }

  private allNeighboursGenerated(cx: number, cz: number): boolean {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        if (!this.world.getChunk(cx + dx, cz + dz)) return false;
      }
    }
    return true;
  }

  /** Synchronously generate + mesh a small area so spawn has ground/visuals. */
  preload(px: number, pz: number, radius: number): void {
    const pcx = Math.floor(px / CHUNK_SIZE);
    const pcz = Math.floor(pz / CHUNK_SIZE);
    for (let dz = -radius - 1; dz <= radius + 1; dz++) {
      for (let dx = -radius - 1; dx <= radius + 1; dx++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        if (!this.world.getChunk(cx, cz)) {
          this.generateChunk(cx, cz);
        }
      }
    }
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        this.meshMgr.rebuildSync(this.world, pcx + dx, pcz + dz);
      }
    }
  }

  /** Per-frame streaming around (px, pz). Returns work done this frame. */
  update(px: number, pz: number): { generated: number; meshed: number; unloaded: number } {
    const pcx = Math.floor(px / CHUNK_SIZE);
    const pcz = Math.floor(pz / CHUNK_SIZE);

    // 1. Generation (radius renderDistance + 1).
    let generated = 0;
    for (const o of this.offsets) {
      if (generated >= this.genBudgetPerFrame) break;
      if (o.dist > this.renderDistance + 1) continue; // never generate to-be-unloaded chunks
      const cx = pcx + o.dx;
      const cz = pcz + o.dz;
      if (!this.world.getChunk(cx, cz)) {
        this.generateChunk(cx, cz);
        generated++;
      }
    }

    // 2. Meshing (radius renderDistance, neighbours generated).
    let meshed = 0;
    for (const o of this.offsets) {
      if (meshed >= this.meshBudgetPerFrame) break;
      if (o.dist > this.renderDistance) continue;
      const cx = pcx + o.dx;
      const cz = pcz + o.dz;
      if (
        this.world.getChunk(cx, cz) &&
        !this.meshMgr.isBuilt(cx, cz) &&
        !this.meshMgr.isPending(cx, cz) &&
        this.allNeighboursGenerated(cx, cz)
      ) {
        this.meshMgr.rebuild(this.world, cx, cz);
        meshed++;
      }
    }

    // 3. Unload chunks beyond the keep radius, budgeted per frame so a large
    //    relocation never disposes hundreds of meshes in a single frame.
    const keep = this.renderDistance + 2;
    let unloaded = 0;
    for (const chunk of this.world.chunks.values()) {
      if (unloaded >= this.unloadBudgetPerFrame) break;
      if (Math.hypot(chunk.cx - pcx, chunk.cz - pcz) > keep) {
        this.meshMgr.remove(chunk.cx, chunk.cz);
        this.world.removeChunk(chunk.cx, chunk.cz);
        unloaded++;
      }
    }

    return { generated, meshed, unloaded };
  }
}
