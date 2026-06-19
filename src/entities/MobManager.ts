import * as THREE from 'three';
import { World } from '../engine/World';
import { BlockId, isSolid } from '../engine/BlockRegistry';
import { CHUNK_HEIGHT } from '../engine/Chunk';
import { Mob } from './Mob';
import {
  MobKind,
  MOB_TYPES,
  PASSIVE_KINDS,
  HOSTILE_KINDS,
  MobDef,
} from './MobType';
import { MobRenderer } from '../renderer/MobRenderer';
import { mobDrops } from '../items/drops';

/**
 * Spawns mobs around the player and manages their lifecycle. Animals spawn on
 * grass in daylight; monsters spawn on any solid surface at night. Hostile mobs
 * chase + attack the player (wired through the per-frame context); creepers
 * detonate, carving terrain and damaging the player. The player can fight back
 * via {@link attackAlongRay}. Despawn radius stays inside the render distance so
 * a mob's chunk never unloads beneath it.
 */

const MAX_MOBS = 14;
const SPAWN_INTERVAL = 2.0;
const SPAWN_MIN = 14;
const SPAWN_MAX = 30;
const DESPAWN_RADIUS = 54;
const SPAWN_TRIES = 8;
const CREEPER_BLAST = 3; // explosion radius (blocks)

const GRASS_SET = new Set<number>([
  BlockId.Grass,
  BlockId.Dirt,
  BlockId.Sand,
  BlockId.Snow,
]);

export type EditBlockFn = (x: number, y: number, z: number, id: BlockId) => void;

export class MobManager {
  readonly mobs: Mob[] = [];
  private readonly renderer: MobRenderer;
  private spawnTimer = 1;

  constructor(
    private readonly world: World,
    scene: THREE.Scene,
    private readonly editBlock: EditBlockFn,
    private readonly addItem: (item: number, count: number) => void = () => {},
  ) {
    this.renderer = new MobRenderer(scene);
  }

  update(
    dt: number,
    playerPos: THREE.Vector3,
    daylight: number,
    hurtPlayer: (amount: number) => void,
  ): void {
    const ctx = { playerPos, daylight, onAttackPlayer: hurtPlayer };

    for (const mob of this.mobs) mob.update(this.world, dt, ctx);

    // Creeper detonations + death/despawn sweep (reverse for safe splicing).
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      if (m.exploding) {
        this.explode(m, playerPos, hurtPlayer);
        m.dead = true;
      }
      const far = Math.hypot(m.position.x - playerPos.x, m.position.z - playerPos.z) > DESPAWN_RADIUS;
      if (m.dead || far) {
        this.renderer.remove(m);
        this.mobs.splice(i, 1);
      }
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = SPAWN_INTERVAL;
      this.trySpawn(playerPos.x, playerPos.z, daylight);
    }

    this.renderer.setDaylight(daylight);
    this.renderer.sync(this.mobs, dt);
  }

  /** Carve a sphere of blocks and damage the player by proximity. */
  private explode(mob: Mob, playerPos: THREE.Vector3, hurtPlayer: (a: number) => void): void {
    const cx = Math.floor(mob.position.x);
    const cy = Math.floor(mob.position.y);
    const cz = Math.floor(mob.position.z);
    for (let dx = -CREEPER_BLAST; dx <= CREEPER_BLAST; dx++) {
      for (let dy = -CREEPER_BLAST; dy <= CREEPER_BLAST; dy++) {
        for (let dz = -CREEPER_BLAST; dz <= CREEPER_BLAST; dz++) {
          if (dx * dx + dy * dy + dz * dz > CREEPER_BLAST * CREEPER_BLAST) continue;
          const x = cx + dx;
          const y = cy + dy;
          const z = cz + dz;
          const id = this.world.getBlock(x, y, z);
          if (id !== BlockId.Air && id !== BlockId.Bedrock) {
            this.editBlock(x, y, z, BlockId.Air);
          }
        }
      }
    }
    const d = mob.position.distanceTo(playerPos);
    if (d < CREEPER_BLAST + 2) {
      hurtPlayer(Math.round(12 * (1 - d / (CREEPER_BLAST + 2))));
    }
  }

  private trySpawn(px: number, pz: number, daylight: number): void {
    if (this.mobs.length >= MAX_MOBS) return;
    const pool = daylight > 0.55 ? PASSIVE_KINDS : daylight < 0.4 ? HOSTILE_KINDS : null;
    if (!pool) return; // dawn/dusk: nothing spawns

    for (let t = 0; t < SPAWN_TRIES; t++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
      const x = Math.floor(px + Math.cos(ang) * dist);
      const z = Math.floor(pz + Math.sin(ang) * dist);
      const kind = pool[Math.floor(Math.random() * pool.length)];
      const y = this.surfaceY(x, z, MOB_TYPES[kind]);
      if (y >= 0) {
        this.spawnAt(x + 0.5, y, z + 0.5, kind);
        return;
      }
    }
  }

  /**
   * Feet Y for a mob of `def` standing at (x,z): the top valid surface with
   * enough headroom. Returns -1 if the column is unloaded or unsuitable.
   */
  surfaceY(x: number, z: number, def: MobDef): number {
    const clearance = Math.ceil(def.height);
    for (let y = CHUNK_HEIGHT - clearance - 1; y >= 1; y--) {
      const id = this.world.getBlock(x, y, z);
      if (!isSolid(id)) continue;
      if (def.grassOnly ? !GRASS_SET.has(id) : id === BlockId.OakLeaves) return -1;
      for (let c = 1; c <= clearance; c++) {
        if (this.world.getBlock(x, y + c, z) !== BlockId.Air) return -1;
      }
      return y + 1;
    }
    return -1;
  }

  spawnAt(x: number, y: number, z: number, kind: MobKind): Mob {
    const mob = new Mob(new THREE.Vector3(x, y, z), MOB_TYPES[kind]);
    this.mobs.push(mob);
    this.renderer.add(mob);
    return mob;
  }

  /** Spawn a specific kind on the surface near a column (debug/tests). */
  spawnKindNear(kind: MobKind, px: number, pz: number): Mob | null {
    const def = MOB_TYPES[kind];
    for (let t = 0; t < 24; t++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 4 + Math.random() * 10;
      const x = Math.floor(px + Math.cos(ang) * dist);
      const z = Math.floor(pz + Math.sin(ang) * dist);
      const y = this.surfaceY(x, z, def);
      if (y >= 0) return this.spawnAt(x + 0.5, y, z + 0.5, kind);
    }
    return null;
  }

  /**
   * Damage the nearest mob whose AABB the ray hits within `reach` (player melee
   * attack). Applies knockback away from the origin. Returns true on a hit.
   */
  attackAlongRay(
    ox: number, oy: number, oz: number,
    dx: number, dy: number, dz: number,
    reach: number, damage: number,
  ): boolean {
    let best: Mob | null = null;
    let bestT = reach;
    for (const mob of this.mobs) {
      const t = rayAabb(ox, oy, oz, dx, dy, dz, mob.aabb());
      if (t !== null && t < bestT) {
        bestT = t;
        best = mob;
      }
    }
    if (!best) return false;
    const kx = best.position.x - ox;
    const kz = best.position.z - oz;
    const len = Math.hypot(kx, kz) || 1;
    best.hurt(damage, (kx / len) * 6, (kz / len) * 6);
    // Killing a mob drops its items into the inventory.
    if (best.dead) {
      for (const d of mobDrops(best.kind)) {
        if (d.count > 0) this.addItem(d.item, d.count);
      }
    }
    return true;
  }

  get count(): number {
    return this.mobs.length;
  }

  countByKind(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const m of this.mobs) out[m.kind] = (out[m.kind] ?? 0) + 1;
    return out;
  }
}

/** Ray vs AABB slab test; returns entry distance t >= 0 or null. */
function rayAabb(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  b: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number },
): number | null {
  let tmin = 0;
  let tmax = Infinity;
  const o = [ox, oy, oz];
  const d = [dx, dy, dz];
  const lo = [b.minX, b.minY, b.minZ];
  const hi = [b.maxX, b.maxY, b.maxZ];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-8) {
      if (o[i] < lo[i] || o[i] > hi[i]) return null;
    } else {
      let t1 = (lo[i] - o[i]) / d[i];
      let t2 = (hi[i] - o[i]) / d[i];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}
