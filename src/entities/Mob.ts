import * as THREE from 'three';
import { World } from '../engine/World';
import { isSolid } from '../engine/BlockRegistry';
import { CHUNK_HEIGHT } from '../engine/Chunk';
import { AABB, moveAndCollide } from '../player/Physics';
import { MobDef, MobKind } from './MobType';

/**
 * A mob instance driven by a {@link MobDef}. Reuses the player's AABB collision
 * solver for gravity + terrain collision. Passive mobs wander randomly; hostile
 * mobs chase the player when within detection range and deal contact damage.
 * Adds health/knockback (so the player can fight back), a slime hop, a daylight
 * burn for undead, and the creeper fuse.
 */

const GRAVITY = 30;
const MAX_FALL = 60;
const STEP_JUMP = 8; // hop a 1-block step
const DETECT_RANGE = 16; // hostile aggro radius (blocks)
const ATTACK_COOLDOWN = 1.0; // seconds between hits
const CREEPER_PRIME_RANGE = 3.2;
const CREEPER_FUSE = 1.5; // seconds
const PLAYER_HALF_WIDTH = 0.3;

/** Context the manager passes into each mob update. */
export interface MobUpdateCtx {
  playerPos: THREE.Vector3;
  daylight: number;
  /** Deal `amount` damage to the player (contact attack). */
  onAttackPlayer: (amount: number) => void;
}

export class Mob {
  readonly def: MobDef;
  readonly kind: MobKind;
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  yaw = 0; // forward = (-sin yaw, -cos yaw)
  onGround = false;
  moving = false;
  walkPhase = 0;

  health: number;
  hurtFlash = 0; // >0 while showing the red damage flash
  dead = false; // manager removes it next tick

  chasing = false; // hostile + player in range
  fuse = -1; // creeper fuse countdown (>=0 while priming)
  exploding = false; // creeper reached 0 → manager handles the blast

  private actionTimer = 0;
  private attackCooldown = 0;
  private burnTimer = 0;
  private stuckTime = 0;

  constructor(spawn: THREE.Vector3, def: MobDef) {
    this.def = def;
    this.kind = def.kind;
    this.position.copy(spawn);
    this.health = def.maxHealth;
    this.yaw = Math.random() * Math.PI * 2;
  }

  get width(): number {
    return this.def.width;
  }
  get height(): number {
    return this.def.height;
  }
  /** 0..1 fuse charge for the renderer (creeper flash). */
  get primeLevel(): number {
    return this.fuse >= 0 ? 1 - this.fuse / CREEPER_FUSE : 0;
  }

  aabb(): AABB {
    const hw = this.def.width / 2;
    return {
      minX: this.position.x - hw,
      maxX: this.position.x + hw,
      minY: this.position.y,
      maxY: this.position.y + this.def.height,
      minZ: this.position.z - hw,
      maxZ: this.position.z + hw,
    };
  }

  /** Apply damage with horizontal knockback; flags dead at zero health. */
  hurt(amount: number, knockX = 0, knockZ = 0): void {
    if (this.dead) return;
    this.health -= amount;
    this.hurtFlash = 0.3;
    this.velocity.x += knockX;
    this.velocity.z += knockZ;
    if (this.onGround) this.velocity.y = 5; // pop up on hit
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
    }
  }

  update(world: World, dt: number, ctx: MobUpdateCtx): void {
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    this.actionTimer -= dt;

    const def = this.def;
    const toPlayerX = ctx.playerPos.x - this.position.x;
    const toPlayerZ = ctx.playerPos.z - this.position.z;
    const planarDist = Math.hypot(toPlayerX, toPlayerZ);

    // --- Decide heading ---
    this.chasing = false;
    if (def.behavior === 'hostile' && planarDist < DETECT_RANGE) {
      this.chasing = true;
      this.yaw = Math.atan2(-toPlayerX, -toPlayerZ); // face the player
      this.moving = true;
    } else if (this.actionTimer <= 0) {
      this.chooseWanderAction();
    }

    // --- Creeper fuse ---
    if (def.explodes && planarDist < CREEPER_PRIME_RANGE) {
      this.fuse = (this.fuse < 0 ? CREEPER_FUSE : this.fuse) - dt;
      this.moving = false; // freeze while priming
      if (this.fuse <= 0) this.exploding = true;
    } else if (def.explodes) {
      this.fuse = -1; // player fled: defuse
    }

    // --- Horizontal velocity from heading ---
    const dirX = -Math.sin(this.yaw);
    const dirZ = -Math.cos(this.yaw);
    if (this.moving) {
      // Wanderers avoid ledges; chasers commit (they path toward the player).
      if (!this.chasing && this.onGround && this.dropAhead(world, dirX, dirZ)) {
        this.velocity.x = 0;
        this.velocity.z = 0;
        this.actionTimer = Math.min(this.actionTimer, 0.2 + Math.random() * 0.4);
      } else {
        // Slimes only steer while airborne-hopping; they lurch on the ground.
        const moveNow = def.hops ? this.onGround : true;
        this.velocity.x = moveNow ? dirX * def.speed : this.velocity.x;
        this.velocity.z = moveNow ? dirZ * def.speed : this.velocity.z;
        if (def.hops && this.onGround) this.velocity.y = STEP_JUMP * 0.75; // bounce
      }
    } else {
      this.velocity.x = 0;
      this.velocity.z = 0;
    }

    // --- Gravity + integrate ---
    this.velocity.y -= GRAVITY * dt;
    if (this.velocity.y < -MAX_FALL) this.velocity.y = -MAX_FALL;

    const res = moveAndCollide(
      world,
      this.aabb(),
      this.velocity.x * dt,
      this.velocity.y * dt,
      this.velocity.z * dt,
    );
    const hw = def.width / 2;
    this.position.set(res.aabb.minX + hw, res.aabb.minY, res.aabb.minZ + hw);
    this.onGround = res.grounded;
    if (res.collidedY) this.velocity.y = 0;

    const blocked = res.collidedX || res.collidedZ;
    if (this.moving && blocked && this.onGround) {
      this.velocity.y = STEP_JUMP; // hop a 1-block step / wall
      this.stuckTime += dt;
      if (!this.chasing && this.stuckTime > 0.7) {
        this.chooseWanderAction();
        this.stuckTime = 0;
      }
    } else {
      this.stuckTime = 0;
    }
    if (res.collidedX) this.velocity.x = 0;
    if (res.collidedZ) this.velocity.z = 0;

    if (this.moving && this.onGround) {
      this.walkPhase += Math.hypot(this.velocity.x, this.velocity.z) * dt * 7;
    }

    // --- Contact attack ---
    if (
      this.chasing &&
      def.damage > 0 &&
      this.attackCooldown <= 0 &&
      planarDist < def.width / 2 + PLAYER_HALF_WIDTH + 0.6 &&
      Math.abs(ctx.playerPos.y - this.position.y) < 2.2
    ) {
      ctx.onAttackPlayer(def.damage);
      this.attackCooldown = ATTACK_COOLDOWN;
    }

    // --- Undead burn in daylight ---
    if (def.burnsInDay && ctx.daylight > 0.65 && this.skyExposed(world)) {
      this.burnTimer += dt;
      if (this.burnTimer >= 0.8) {
        this.burnTimer = 0;
        this.hurt(1);
      }
    } else {
      this.burnTimer = 0;
    }
  }

  private chooseWanderAction(): void {
    if (Math.random() < 0.35) {
      this.moving = false;
      this.actionTimer = 1 + Math.random() * 2.5;
    } else {
      this.moving = true;
      this.yaw = Math.random() * Math.PI * 2;
      this.actionTimer = 2 + Math.random() * 3.5;
    }
  }

  private dropAhead(world: World, dirX: number, dirZ: number): boolean {
    const ax = Math.floor(this.position.x + dirX * (this.def.width / 2 + 0.4));
    const az = Math.floor(this.position.z + dirZ * (this.def.width / 2 + 0.4));
    const fy = Math.floor(this.position.y);
    if (isSolid(world.getBlock(ax, fy - 1, az))) return false;
    return !isSolid(world.getBlock(ax, fy - 2, az));
  }

  /** True when no solid block is above the mob (open to the sky) — for burning. */
  private skyExposed(world: World): boolean {
    const x = Math.floor(this.position.x);
    const z = Math.floor(this.position.z);
    const startY = Math.ceil(this.position.y + this.def.height);
    const top = Math.min(CHUNK_HEIGHT - 1, startY + 40);
    for (let y = startY; y <= top; y++) {
      if (isSolid(world.getBlock(x, y, z))) return false;
    }
    return true;
  }
}
