import * as THREE from 'three';
import { World } from '../engine/World';
import { AABB, moveAndCollide } from './Physics';

export const PLAYER_WIDTH = 0.6;
export const PLAYER_HEIGHT = 1.8;
export const EYE_HEIGHT = 1.62;

const WALK_SPEED = 4.317; // blocks/s (Minecraft default)
const SNEAK_MULT = 0.3;
const GRAVITY = 30; // blocks/s^2
const JUMP_SPEED = 9; // gives ~1.35 block jump height
const MAX_FALL_SPEED = 60;

export interface MoveInput {
  forward: number; // -1 (back) .. 1 (forward)
  right: number; // -1 (left) .. 1 (right)
  jump: boolean;
  sneak: boolean;
  yaw: number; // radians, camera heading
}

/**
 * Player state + movement integration. `position` is the feet centre: the AABB
 * spans [x±w/2] horizontally and [y, y+height] vertically.
 */
export const PLAYER_MAX_HEALTH = 20;
const HURT_INVULN = 0.5; // seconds of i-frames after a hit

export class Player {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  onGround = false;

  readonly spawn = new THREE.Vector3();
  health = PLAYER_MAX_HEALTH;
  dead = false;
  hurtCooldown = 0;
  /** Brief flag set the frame damage is taken (drives the HUD red flash). */
  justHurt = false;
  /** Armor points from equipped gear (each ≈ 4% damage reduction). */
  armorPoints = 0;

  constructor(spawn: THREE.Vector3) {
    this.position.copy(spawn);
    this.spawn.copy(spawn);
  }

  /** Apply damage (reduced by armor), respecting i-frames; flags death at 0. */
  hurt(amount: number): void {
    if (this.dead || this.hurtCooldown > 0 || amount <= 0) return;
    const reduction = Math.min(0.8, this.armorPoints * 0.04);
    const dealt = Math.max(1, Math.round(amount * (1 - reduction)));
    this.health = Math.max(0, this.health - dealt);
    this.hurtCooldown = HURT_INVULN;
    this.justHurt = true;
    if (this.health === 0) this.dead = true;
  }

  /** Reset to the spawn point with full health. */
  respawn(): void {
    this.position.copy(this.spawn);
    this.velocity.set(0, 0, 0);
    this.health = PLAYER_MAX_HEALTH;
    this.dead = false;
    this.hurtCooldown = 0;
  }

  aabb(): AABB {
    const hw = PLAYER_WIDTH / 2;
    return {
      minX: this.position.x - hw,
      maxX: this.position.x + hw,
      minY: this.position.y,
      maxY: this.position.y + PLAYER_HEIGHT,
      minZ: this.position.z - hw,
      maxZ: this.position.z + hw,
    };
  }

  eyePosition(target = new THREE.Vector3()): THREE.Vector3 {
    return target.set(
      this.position.x,
      this.position.y + EYE_HEIGHT,
      this.position.z,
    );
  }

  update(world: World, input: MoveInput, dt: number): void {
    if (this.hurtCooldown > 0) this.hurtCooldown -= dt;

    // Horizontal wish direction in camera space.
    const sin = Math.sin(input.yaw);
    const cos = Math.cos(input.yaw);
    const fwdX = -sin;
    const fwdZ = -cos;
    const rightX = cos;
    const rightZ = -sin;

    let wishX = fwdX * input.forward + rightX * input.right;
    let wishZ = fwdZ * input.forward + rightZ * input.right;
    const len = Math.hypot(wishX, wishZ);
    if (len > 1e-5) {
      wishX /= len;
      wishZ /= len;
    }
    const speed = input.sneak ? WALK_SPEED * SNEAK_MULT : WALK_SPEED;
    this.velocity.x = wishX * speed;
    this.velocity.z = wishZ * speed;

    // Jump must be applied before gravity so it takes effect this step.
    if (input.jump && this.onGround) {
      this.velocity.y = JUMP_SPEED;
      this.onGround = false;
    }

    // Gravity
    this.velocity.y -= GRAVITY * dt;
    if (this.velocity.y < -MAX_FALL_SPEED) this.velocity.y = -MAX_FALL_SPEED;

    // Integrate with collision resolution.
    const res = moveAndCollide(
      world,
      this.aabb(),
      this.velocity.x * dt,
      this.velocity.y * dt,
      this.velocity.z * dt,
    );

    const hw = PLAYER_WIDTH / 2;
    this.position.x = res.aabb.minX + hw;
    this.position.y = res.aabb.minY;
    this.position.z = res.aabb.minZ + hw;

    this.onGround = res.grounded;
    if (res.collidedY) this.velocity.y = 0;
    if (res.collidedX) this.velocity.x = 0;
    if (res.collidedZ) this.velocity.z = 0;
  }
}
