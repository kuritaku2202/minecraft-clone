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
export class Player {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  onGround = false;

  constructor(spawn: THREE.Vector3) {
    this.position.copy(spawn);
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
