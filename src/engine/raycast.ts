/**
 * Voxel ray traversal using the Amanatides & Woo grid-marching algorithm.
 * Returns the first solid voxel hit within `maxDistance`, along with the face
 * normal (pointing back toward the ray origin) so callers can place a block on
 * the adjacent empty cell.
 */

export interface VoxelHit {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  distance: number;
}

export type SolidTest = (x: number, y: number, z: number) => boolean;

function tMaxInit(origin: number, dir: number): number {
  if (dir === 0) return Infinity;
  const cell = Math.floor(origin);
  const next = dir > 0 ? cell + 1 : cell;
  return (next - origin) / dir; // always >= 0
}

export function raycastVoxel(
  isSolidAt: SolidTest,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDistance: number,
): VoxelHit | null {
  const len = Math.hypot(dx, dy, dz);
  if (len === 0) return null;
  dx /= len;
  dy /= len;
  dz /= len;

  let x = Math.floor(ox);
  let y = Math.floor(oy);
  let z = Math.floor(oz);

  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;

  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;

  let tMaxX = tMaxInit(ox, dx);
  let tMaxY = tMaxInit(oy, dy);
  let tMaxZ = tMaxInit(oz, dz);

  // Ray origin already inside a solid voxel: report it with no face.
  if (isSolidAt(x, y, z)) {
    return { x, y, z, nx: 0, ny: 0, nz: 0, distance: 0 };
  }

  let nx = 0;
  let ny = 0;
  let nz = 0;
  let t = 0;

  // Bound iterations defensively (maxDistance blocks across 3 axes).
  const maxSteps = Math.ceil(maxDistance) * 3 + 3;
  for (let i = 0; i < maxSteps; i++) {
    if (tMaxX < tMaxY) {
      if (tMaxX < tMaxZ) {
        x += stepX;
        t = tMaxX;
        tMaxX += tDeltaX;
        nx = -stepX;
        ny = 0;
        nz = 0;
      } else {
        z += stepZ;
        t = tMaxZ;
        tMaxZ += tDeltaZ;
        nx = 0;
        ny = 0;
        nz = -stepZ;
      }
    } else {
      if (tMaxY < tMaxZ) {
        y += stepY;
        t = tMaxY;
        tMaxY += tDeltaY;
        nx = 0;
        ny = -stepY;
        nz = 0;
      } else {
        z += stepZ;
        t = tMaxZ;
        tMaxZ += tDeltaZ;
        nx = 0;
        ny = 0;
        nz = -stepZ;
      }
    }

    if (t > maxDistance) return null;
    if (isSolidAt(x, y, z)) {
      return { x, y, z, nx, ny, nz, distance: t };
    }
  }
  return null;
}
