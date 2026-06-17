import { World } from '../engine/World';
import { isSolid } from '../engine/BlockRegistry';

/**
 * Deterministic 3D AABB collision resolution, following the research document's
 * "clip the displacement per axis, applying one axis at a time" approach. No
 * rigid-body solver and no restitution — displacement is shortened against the
 * solid voxels in the broadphase region, resolving Y, then X, then Z.
 */

export interface AABB {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export interface MoveResult {
  aabb: AABB;
  collidedX: boolean;
  collidedY: boolean;
  collidedZ: boolean;
  /** True when downward motion was stopped this step (i.e. landed/standing). */
  grounded: boolean;
}

const intersectsX = (a: AABB, c: AABB) => a.minX < c.maxX && a.maxX > c.minX;
const intersectsY = (a: AABB, c: AABB) => a.minY < c.maxY && a.maxY > c.minY;
const intersectsZ = (a: AABB, c: AABB) => a.minZ < c.maxZ && a.maxZ > c.minZ;

function clipY(a: AABB, c: AABB, dy: number): number {
  if (!(intersectsX(a, c) && intersectsZ(a, c))) return dy;
  if (dy > 0 && a.maxY <= c.minY) {
    const clip = c.minY - a.maxY;
    if (dy > clip) return clip;
  } else if (dy < 0 && a.minY >= c.maxY) {
    const clip = c.maxY - a.minY;
    if (dy < clip) return clip;
  }
  return dy;
}

function clipX(a: AABB, c: AABB, dx: number): number {
  if (!(intersectsY(a, c) && intersectsZ(a, c))) return dx;
  if (dx > 0 && a.maxX <= c.minX) {
    const clip = c.minX - a.maxX;
    if (dx > clip) return clip;
  } else if (dx < 0 && a.minX >= c.maxX) {
    const clip = c.maxX - a.minX;
    if (dx < clip) return clip;
  }
  return dx;
}

function clipZ(a: AABB, c: AABB, dz: number): number {
  if (!(intersectsX(a, c) && intersectsY(a, c))) return dz;
  if (dz > 0 && a.maxZ <= c.minZ) {
    const clip = c.minZ - a.maxZ;
    if (dz > clip) return clip;
  } else if (dz < 0 && a.minZ >= c.maxZ) {
    const clip = c.maxZ - a.minZ;
    if (dz < clip) return clip;
  }
  return dz;
}

/** Gather solid unit-cube colliders overlapping the swept broadphase region. */
function gatherColliders(
  world: World,
  a: AABB,
  dx: number,
  dy: number,
  dz: number,
): AABB[] {
  const minX = Math.floor(Math.min(a.minX, a.minX + dx)) - 1;
  const maxX = Math.floor(Math.max(a.maxX, a.maxX + dx)) + 1;
  const minY = Math.floor(Math.min(a.minY, a.minY + dy)) - 1;
  const maxY = Math.floor(Math.max(a.maxY, a.maxY + dy)) + 1;
  const minZ = Math.floor(Math.min(a.minZ, a.minZ + dz)) - 1;
  const maxZ = Math.floor(Math.max(a.maxZ, a.maxZ + dz)) + 1;

  const colliders: AABB[] = [];
  for (let by = minY; by <= maxY; by++) {
    for (let bz = minZ; bz <= maxZ; bz++) {
      for (let bx = minX; bx <= maxX; bx++) {
        if (isSolid(world.getBlock(bx, by, bz))) {
          colliders.push({
            minX: bx,
            minY: by,
            minZ: bz,
            maxX: bx + 1,
            maxY: by + 1,
            maxZ: bz + 1,
          });
        }
      }
    }
  }
  return colliders;
}

/**
 * Move `aabb` by `disp`, clipping against solid voxels. Returns the resolved
 * AABB (a fresh object) and which axes collided.
 */
export function moveAndCollide(
  world: World,
  aabb: AABB,
  dx: number,
  dy: number,
  dz: number,
): MoveResult {
  const a: AABB = { ...aabb };
  const colliders = gatherColliders(world, a, dx, dy, dz);

  // Y axis
  let cy = dy;
  for (const c of colliders) cy = clipY(a, c, cy);
  a.minY += cy;
  a.maxY += cy;
  const collidedY = cy !== dy;
  const grounded = dy < 0 && collidedY;

  // X axis (resolved against the already-moved AABB)
  let cx = dx;
  for (const c of colliders) cx = clipX(a, c, cx);
  a.minX += cx;
  a.maxX += cx;
  const collidedX = cx !== dx;

  // Z axis
  let cz = dz;
  for (const c of colliders) cz = clipZ(a, c, cz);
  a.minZ += cz;
  a.maxZ += cz;
  const collidedZ = cz !== dz;

  return { aabb: a, collidedX, collidedY, collidedZ, grounded };
}
