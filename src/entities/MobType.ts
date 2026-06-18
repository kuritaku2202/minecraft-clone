/**
 * Data-driven mob species. Behaviour, size, stats and spawn rules live here as
 * plain data; {@link Mob} reads a def to drive its AI/physics and
 * {@link MobRenderer} builds a matching blocky model keyed by {@link MobKind}.
 */

export type MobKind =
  | 'pig'
  | 'cow'
  | 'sheep'
  | 'chicken'
  | 'zombie'
  | 'skeleton'
  | 'creeper'
  | 'spider'
  | 'slime'
  | 'enderman';

export type Behavior = 'passive' | 'hostile';

export interface MobDef {
  kind: MobKind;
  name: string;
  behavior: Behavior;
  width: number; // AABB footprint (X and Z)
  height: number; // AABB height
  speed: number; // blocks/s
  maxHealth: number;
  /** Contact damage dealt to the player (hostile). */
  damage: number;
  /** Spawn only at night (monsters) vs. daytime (animals). */
  nocturnal: boolean;
  /** Animals need grassy ground; monsters spawn on any solid surface. */
  grassOnly: boolean;
  /** Burns (takes damage) in bright daylight when exposed to the sky. */
  burnsInDay: boolean;
  /** Hops in discrete leaps instead of a steady walk (slime). */
  hops: boolean;
  /** Creeper: primes a fuse near the player and explodes. */
  explodes: boolean;
}

function def(d: Partial<MobDef> & Pick<MobDef, 'kind' | 'name' | 'behavior'>): MobDef {
  return {
    width: 0.9,
    height: 0.9,
    speed: 1.5,
    maxHealth: 10,
    damage: 0,
    nocturnal: d.behavior === 'hostile',
    grassOnly: d.behavior === 'passive',
    burnsInDay: false,
    hops: false,
    explodes: false,
    ...d,
  };
}

export const MOB_TYPES: Record<MobKind, MobDef> = {
  // --- Passive animals (spawn on grass in daylight) ---
  pig: def({ kind: 'pig', name: 'Pig', behavior: 'passive', width: 0.9, height: 0.9, speed: 1.6, maxHealth: 10 }),
  cow: def({ kind: 'cow', name: 'Cow', behavior: 'passive', width: 0.9, height: 1.3, speed: 1.4, maxHealth: 10 }),
  sheep: def({ kind: 'sheep', name: 'Sheep', behavior: 'passive', width: 0.9, height: 1.1, speed: 1.5, maxHealth: 8 }),
  chicken: def({ kind: 'chicken', name: 'Chicken', behavior: 'passive', width: 0.5, height: 0.7, speed: 1.8, maxHealth: 4 }),

  // --- Hostile monsters (spawn at night on any surface) ---
  zombie: def({ kind: 'zombie', name: 'Zombie', behavior: 'hostile', width: 0.6, height: 1.9, speed: 1.5, maxHealth: 20, damage: 3, burnsInDay: true }),
  skeleton: def({ kind: 'skeleton', name: 'Skeleton', behavior: 'hostile', width: 0.6, height: 1.95, speed: 1.6, maxHealth: 16, damage: 2, burnsInDay: true }),
  creeper: def({ kind: 'creeper', name: 'Creeper', behavior: 'hostile', width: 0.6, height: 1.7, speed: 1.5, maxHealth: 20, damage: 0, explodes: true }),
  spider: def({ kind: 'spider', name: 'Spider', behavior: 'hostile', width: 1.4, height: 0.9, speed: 2.0, maxHealth: 16, damage: 2 }),
  slime: def({ kind: 'slime', name: 'Slime', behavior: 'hostile', width: 0.8, height: 0.8, speed: 1.3, maxHealth: 8, damage: 2, hops: true }),
  enderman: def({ kind: 'enderman', name: 'Enderman', behavior: 'hostile', width: 0.6, height: 2.9, speed: 1.9, maxHealth: 20, damage: 3 }),
};

export const ALL_MOB_KINDS = Object.keys(MOB_TYPES) as MobKind[];
export const PASSIVE_KINDS = ALL_MOB_KINDS.filter((k) => MOB_TYPES[k].behavior === 'passive');
export const HOSTILE_KINDS = ALL_MOB_KINDS.filter((k) => MOB_TYPES[k].behavior === 'hostile');
