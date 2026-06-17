import * as THREE from 'three';

/**
 * Procedurally generated texture atlas. Each block face samples one 16x16 tile
 * from this atlas. Generating it in code avoids shipping image assets while
 * still giving every block face a distinct, grid-bordered look so individual
 * voxel boundaries are clearly visible.
 */

export const TILE_PX = 16;
export const ATLAS_COLS = 4;
export const ATLAS_ROWS = 4;

const ATLAS_W = ATLAS_COLS * TILE_PX;
const ATLAS_H = ATLAS_ROWS * TILE_PX;

type RGB = [number, number, number];

function clamp8(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

/** Cheap deterministic per-pixel jitter so tiles are not flat colour. */
function jitter(seed: number, amount: number): number {
  const n = Math.sin(seed * 12.9898) * 43758.5453;
  return (n - Math.floor(n) - 0.5) * 2 * amount;
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  tileIndex: number,
  shade: (px: number, py: number) => RGB,
): void {
  const col = tileIndex % ATLAS_COLS;
  const row = Math.floor(tileIndex / ATLAS_COLS);
  const ox = col * TILE_PX;
  const oy = row * TILE_PX;

  for (let py = 0; py < TILE_PX; py++) {
    for (let px = 0; px < TILE_PX; px++) {
      let [r, g, b] = shade(px, py);
      // Darken the 1px outer ring so block boundaries read clearly.
      const onEdge =
        px === 0 || py === 0 || px === TILE_PX - 1 || py === TILE_PX - 1;
      if (onEdge) {
        r *= 0.78;
        g *= 0.78;
        b *= 0.78;
      }
      ctx.fillStyle = `rgb(${clamp8(r)},${clamp8(g)},${clamp8(b)})`;
      ctx.fillRect(ox + px, oy + py, 1, 1);
    }
  }
}

export function createAtlasTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_W;
  canvas.height = ATLAS_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable for atlas');

  // Tile 0: grass top — green with speckle.
  drawTile(ctx, 0, (px, py) => {
    const j = jitter(px * 31 + py * 7, 18);
    return [70 + j, 140 + j, 55 + j];
  });

  // Tile 1: dirt — brown.
  drawTile(ctx, 1, (px, py) => {
    const j = jitter(px * 17 + py * 23, 16);
    return [125 + j, 88 + j, 58 + j];
  });

  // Tile 2: stone — grey.
  drawTile(ctx, 2, (px, py) => {
    const j = jitter(px * 13 + py * 29, 14);
    return [128 + j, 128 + j, 130 + j];
  });

  // Tile 3: grass side — dirt with a green overhang along the top rows.
  // (flipY is false, so canvas-top maps to v=1 / the block's upper edge.)
  drawTile(ctx, 3, (px, py) => {
    const j = jitter(px * 19 + py * 11, 16);
    if (py < 4) return [70 + j, 140 + j, 55 + j];
    return [125 + j, 88 + j, 58 + j];
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export interface TileRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/** UV rectangle for a tile, inset slightly to avoid neighbour bleeding. */
export function tileRect(index: number): TileRect {
  const col = index % ATLAS_COLS;
  const row = Math.floor(index / ATLAS_COLS);
  const pad = 0.1 / ATLAS_W; // sub-texel inset
  return {
    u0: col / ATLAS_COLS + pad,
    v0: row / ATLAS_ROWS + pad,
    u1: (col + 1) / ATLAS_COLS - pad,
    v1: (row + 1) / ATLAS_ROWS - pad,
  };
}
