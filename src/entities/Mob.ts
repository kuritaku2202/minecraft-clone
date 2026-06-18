import * as THREE from 'three';
import { World } from '../engine/World';
import { isSolid } from '../engine/BlockRegistry';
import { AABB, moveAndCollide } from '../player/Physics';

/**
 * A wandering passive mob (currently just pigs). Reuses the player's AABB
 * collision solver for gravity + terrain collision, and runs a small wander
 * state machine on top: idle / walk in a random heading, hop over 1-block steps,
 * and avoid walking off ledges taller than one block (the "basic pathfinding").
 */

export const MOB_WIDTH = 0.9;
export const MOB_HEIGHT = 0.9;

const GRAVITY = 30; // blocks/s^2 (matches the player)
const MAX_FALL = 60;
const WANDER_SPEED = 1.6; // blocks/s, slower than the player
const STEP_JUMP = 8; // upward speed to hop a 1-block step

export type MobKind = 'pig';

export class Mob {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  yaw = 0; // heading; forward = (-sin yaw, -cos yaw), matching the player
  onGround = false;
  moving = false;
  walkPhase = 0; // advances while walking, drives the leg animation
  readonly kind: MobKind;

  private actionTimer = 0;
  private stuckTime = 0;

  constructor(spawn: THREE.Vector3, kind: MobKind = 'pig') {
    this.position.copy(spawn);
    this.kind = kind;
    this.yaw = Math.random() * Math.PI * 2;
  }

  get width(): number {
    return MOB_WIDTH;
  }
  get height(): number {
    return MOB_HEIGHT;
  }

  aabb(): AABB {
    const hw = MOB_WIDTH / 2;
    return {
      minX: this.position.x - hw,
      maxX: this.position.x + hw,
      minY: this.position.y,
      maxY: this.position.y + MOB_HEIGHT,
      minZ: this.position.z - hw,
      maxZ: this.position.z + hw,
    };
  }

  update(world: World, dt: number): void {
    this.actionTimer -= dt;
    if (this.actionTimer <= 0) this.chooseAction();

    const dirX = -Math.sin(this.yaw);
    const dirZ = -Math.cos(this.yaw);

    if (this.moving) {
      if (this.onGround && this.dropAhead(world, dirX, dirZ)) {
        // Ledge ahead: stop and re-roll a new heading shortly.
        this.velocity.x = 0;
        this.velocity.z = 0;
        this.actionTimer = Math.min(this.actionTimer, 0.2 + Math.random() * 0.4);
      } else {
        this.velocity.x = dirX * WANDER_SPEED;
        this.velocity.z = dirZ * WANDER_SPEED;
      }
    } else {
      this.velocity.x = 0;
      this.velocity.z = 0;
    }

    this.velocity.y -= GRAVITY * dt;
    if (this.velocity.y < -MAX_FALL) this.velocity.y = -MAX_FALL;

    const res = moveAndCollide(
      world,
      this.aabb(),
      this.velocity.x * dt,
      this.velocity.y * dt,
      this.velocity.z * dt,
    );

    const hw = MOB_WIDTH / 2;
    this.position.set(res.aabb.minX + hw, res.aabb.minY, res.aabb.minZ + hw);
    this.onGround = res.grounded;
    if (res.collidedY) this.velocity.y = 0;

    // Blocked by a wall while walking: hop to clear a 1-block step; if still
    // stuck after a moment, pick a new heading.
    const blocked = res.collidedX || res.collidedZ;
    if (this.moving && blocked && this.onGround) {
      this.velocity.y = STEP_JUMP;
      this.stuckTime += dt;
      if (this.stuckTime > 0.7) {
        this.chooseAction();
        this.stuckTime = 0;
      }
    } else {
      this.stuckTime = 0;
    }
    if (res.collidedX) this.velocity.x = 0;
    if (res.collidedZ) this.velocity.z = 0;

    if (this.moving && this.onGround) {
      const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
      this.walkPhase += hSpeed * dt * 7;
    }
  }

  /** Idle, or pick a random heading and walk for a few seconds. */
  private chooseAction(): void {
    if (Math.random() < 0.35) {
      this.moving = false;
      this.actionTimer = 1 + Math.random() * 2.5;
    } else {
      this.moving = true;
      this.yaw = Math.random() * Math.PI * 2;
      this.actionTimer = 2 + Math.random() * 3.5;
    }
  }

  /** True when the cell ahead drops two or more blocks (a ledge to avoid). */
  private dropAhead(world: World, dirX: number, dirZ: number): boolean {
    const ax = Math.floor(this.position.x + dirX * (MOB_WIDTH / 2 + 0.4));
    const az = Math.floor(this.position.z + dirZ * (MOB_WIDTH / 2 + 0.4));
    const fy = Math.floor(this.position.y);
    if (isSolid(world.getBlock(ax, fy - 1, az))) return false; // ground ahead
    return !isSolid(world.getBlock(ax, fy - 2, az)); // drop >= 2 → avoid
  }
}
