import * as THREE from 'three';
import { World } from '../engine/World';
import { Player } from './Player';
import { Controls } from './Controls';
import { HUD } from '../ui/HUD';
import { raycastVoxel, type VoxelHit } from '../engine/raycast';
import { BlockId, isSolid } from '../engine/BlockRegistry';

/** Applies a block edit (write + re-mesh + notify); supplied by ChunkManager. */
export type EditBlockFn = (x: number, y: number, z: number, id: BlockId) => void;

/** Melee attack along the look ray; returns true if a mob was hit. */
export type AttackMobFn = (
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
) => boolean;

const REACH = 5; // max interaction distance in blocks
const BREAK_TIME = 0.35; // seconds to break a block (uniform for now)

/**
 * Block targeting and editing: raycasts from the eye each frame to find the
 * looked-at voxel, draws a wireframe highlight, breaks blocks on held
 * left-click (with a progress bar) and places the held block on right-click.
 */
export class Interaction {
  target: VoxelHit | null = null;
  heldBlock: BlockId = BlockId.Stone;
  /** When true (e.g. inventory open) break/place and targeting are suspended. */
  blocked = false;

  private breaking = false;
  private breakProgress = 0;
  private breakKey: string | null = null;

  private readonly highlight: THREE.LineSegments;
  private readonly scratchEye = new THREE.Vector3();
  // Latest look ray (updated each frame) so the click handler can attack mobs.
  private readonly lookEye = new THREE.Vector3();
  private readonly lookDir = new THREE.Vector3(0, 0, -1);
  private attackMob: AttackMobFn | null = null;

  constructor(
    private readonly world: World,
    private readonly player: Player,
    private readonly controls: Controls,
    private readonly applyEdit: EditBlockFn,
    private readonly hud: HUD,
    scene: THREE.Scene,
    canvas: HTMLCanvasElement,
  ) {
    this.highlight = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
      new THREE.LineBasicMaterial({ color: 0x000000 }),
    );
    this.highlight.visible = false;
    scene.add(this.highlight);

    canvas.addEventListener('mousedown', (e) => {
      if (this.blocked) return;
      if (e.button === 0) {
        // A left click attacks a mob in the crosshair, else starts breaking.
        if (this.tryAttackMob()) return;
        this.breaking = true;
      } else if (e.button === 2) {
        this.place();
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.cancelBreak();
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setHeld(id: BlockId): void {
    this.heldBlock = id;
  }

  /** Supply the mob melee hook (wired in main.ts). */
  setAttackMob(fn: AttackMobFn): void {
    this.attackMob = fn;
  }

  private tryAttackMob(): boolean {
    if (!this.attackMob) return false;
    return this.attackMob(
      this.lookEye.x, this.lookEye.y, this.lookEye.z,
      this.lookDir.x, this.lookDir.y, this.lookDir.z,
    );
  }

  private editBlock(x: number, y: number, z: number, id: BlockId): void {
    this.applyEdit(x, y, z, id);
  }

  /** Place the held block against the targeted face. */
  place(): boolean {
    if (this.blocked) return false; // suspended (e.g. inventory open)
    if (this.heldBlock === BlockId.Air) return false; // empty hotbar slot
    const hit = this.target;
    if (!hit) return false;
    const px = hit.x + hit.nx;
    const py = hit.y + hit.ny;
    const pz = hit.z + hit.nz;
    if (isSolid(this.world.getBlock(px, py, pz))) return false;
    if (this.intersectsPlayer(px, py, pz)) return false; // don't bury the player
    this.editBlock(px, py, pz, this.heldBlock);
    return true;
  }

  /** Instantly break the targeted block (used by tests / creative). */
  breakTarget(): boolean {
    if (this.blocked) return false; // suspended (e.g. inventory open)
    const hit = this.target;
    if (!hit) return false;
    this.editBlock(hit.x, hit.y, hit.z, BlockId.Air);
    return true;
  }

  private cancelBreak(): void {
    this.breaking = false;
    this.breakProgress = 0;
    this.breakKey = null;
  }

  private intersectsPlayer(px: number, py: number, pz: number): boolean {
    const a = this.player.aabb();
    return (
      a.minX < px + 1 &&
      a.maxX > px &&
      a.minY < py + 1 &&
      a.maxY > py &&
      a.minZ < pz + 1 &&
      a.maxZ > pz
    );
  }

  update(dt: number): void {
    // While the inventory is open, suspend targeting/breaking entirely.
    if (this.blocked) {
      this.target = null;
      this.highlight.visible = false;
      if (this.breakProgress !== 0 || this.breaking) this.cancelBreak();
      this.hud.setBreakProgress(0);
      return;
    }

    const eye = this.player.eyePosition(this.scratchEye);
    const { yaw, pitch } = this.controls;
    const cp = Math.cos(pitch);
    const dirX = -Math.sin(yaw) * cp;
    const dirY = Math.sin(pitch);
    const dirZ = -Math.cos(yaw) * cp;

    // Cache the look ray for the click handler's mob attack.
    this.lookEye.copy(eye);
    this.lookDir.set(dirX, dirY, dirZ);

    const solid = (x: number, y: number, z: number) =>
      isSolid(this.world.getBlock(x, y, z));
    const hit = raycastVoxel(solid, eye.x, eye.y, eye.z, dirX, dirY, dirZ, REACH);
    this.target = hit;

    if (hit) {
      this.highlight.visible = true;
      this.highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    } else {
      this.highlight.visible = false;
    }

    if (this.breaking && hit) {
      const key = `${hit.x},${hit.y},${hit.z}`;
      if (this.breakKey === key) this.breakProgress += dt / BREAK_TIME;
      else {
        this.breakKey = key;
        this.breakProgress = 0;
      }
      if (this.breakProgress >= 1) {
        this.editBlock(hit.x, hit.y, hit.z, BlockId.Air);
        this.breakProgress = 0;
        this.breakKey = null;
      }
    } else if (this.breakProgress !== 0) {
      this.breakProgress = 0;
      this.breakKey = null;
    }

    this.hud.setBreakProgress(this.breaking && hit ? this.breakProgress : 0);
  }
}
