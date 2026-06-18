import * as THREE from 'three';
import { World } from '../engine/World';
import { BlockId, isSolid } from '../engine/BlockRegistry';
import { CHUNK_HEIGHT } from '../engine/Chunk';
import { Mob } from './Mob';
import { MobRenderer } from '../renderer/MobRenderer';

/**
 * Spawns wandering mobs on the surface around the player, caps the population,
 * and despawns mobs that stray too far. The despawn radius is well inside the
 * chunk render distance, so a mob's chunk never unloads under it.
 */

const MAX_MOBS = 8;
const SPAWN_INTERVAL = 2.5; // seconds between spawn attempts
const SPAWN_MIN = 14; // blocks from the player
const SPAWN_MAX = 30;
const DESPAWN_RADIUS = 52;
const SPAWN_TRIES = 8; // candidate columns per attempt

// Blocks a mob may stand on (grassy / sandy / snowy ground, not bare stone).
const SPAWNABLE = new Set<number>([
  BlockId.Grass,
  BlockId.Dirt,
  BlockId.Sand,
  BlockId.Snow,
]);

export class MobManager {
  readonly mobs: Mob[] = [];
  private readonly renderer: MobRenderer;
  private spawnTimer = 1;

  constructor(
    private readonly world: World,
    scene: THREE.Scene,
  ) {
    this.renderer = new MobRenderer(scene);
  }

  update(dt: number, px: number, pz: number, daylight: number): void {
    for (const mob of this.mobs) mob.update(this.world, dt);

    // Despawn mobs that wandered (or were carried) out of range.
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      if (Math.hypot(m.position.x - px, m.position.z - pz) > DESPAWN_RADIUS) {
        this.renderer.remove(m);
        this.mobs.splice(i, 1);
      }
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = SPAWN_INTERVAL;
      if (this.mobs.length < MAX_MOBS) this.trySpawn(px, pz);
    }

    this.renderer.setDaylight(daylight);
    this.renderer.sync(this.mobs);
  }

  /** Probe a few random columns for a valid surface and spawn one mob. */
  private trySpawn(px: number, pz: number): Mob | null {
    for (let t = 0; t < SPAWN_TRIES; t++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
      const x = Math.floor(px + Math.cos(ang) * dist);
      const z = Math.floor(pz + Math.sin(ang) * dist);
      const y = this.surfaceY(x, z);
      if (y >= 0) return this.spawnAt(x + 0.5, y, z + 0.5);
    }
    return null;
  }

  /**
   * Feet Y for a mob standing at column (x,z): the top spawnable surface with
   * two air blocks above it. Returns -1 if the column is unloaded or unsuitable.
   */
  surfaceY(x: number, z: number): number {
    for (let y = CHUNK_HEIGHT - 3; y >= 1; y--) {
      const id = this.world.getBlock(x, y, z);
      if (!isSolid(id)) continue;
      if (!SPAWNABLE.has(id)) return -1; // first solid isn't valid ground
      if (
        this.world.getBlock(x, y + 1, z) === BlockId.Air &&
        this.world.getBlock(x, y + 2, z) === BlockId.Air
      ) {
        return y + 1;
      }
      return -1;
    }
    return -1;
  }

  spawnAt(x: number, y: number, z: number): Mob {
    const mob = new Mob(new THREE.Vector3(x, y, z));
    this.mobs.push(mob);
    this.renderer.add(mob);
    return mob;
  }

  /** Force a spawn near a column (used by debug/tests); null if none found. */
  spawnNear(px: number, pz: number): Mob | null {
    return this.trySpawn(px, pz);
  }

  get count(): number {
    return this.mobs.length;
  }
}
