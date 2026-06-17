import { TILE_PX, tilePixel } from '../engine/textures';
import { getBlockDef, type BlockId } from '../engine/BlockRegistry';

/**
 * Pseudo-isometric cube icons for inventory / hotbar slots. Each block's tiles
 * are averaged into a flat face colour, then three shaded parallelograms are
 * drawn so the icon reads as a 3D block — the same top-bright / sides-darker
 * shading the world mesh uses. Results are cached per block id.
 */

type RGB = [number, number, number];

const cache = new Map<number, string>();

/** Average a tile's interior pixels (skipping the dark border ring). */
function avgTileColor(tile: number): RGB {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let py = 3; py < TILE_PX - 3; py++) {
    for (let px = 3; px < TILE_PX - 3; px++) {
      const [pr, pg, pb] = tilePixel(tile, px, py);
      r += pr;
      g += pg;
      b += pb;
      n++;
    }
  }
  return [r / n, g / n, b / n];
}

function shade([r, g, b]: RGB, k: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

/** A cached PNG data URL of an isometric cube icon for the block. */
export function blockIconDataURL(id: BlockId, size = 48): string {
  const cacheKey = id * 1000 + size;
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  const def = getBlockDef(id);
  const top = avgTileColor(def.tiles.top);
  const side = avgTileColor(def.tiles.side);

  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d');
  if (!ctx) return '';
  const s = size;

  // Iso cube vertices (fractions of the canvas).
  const P = {
    top: [0.5 * s, 0.08 * s],
    left: [0.1 * s, 0.3 * s],
    right: [0.9 * s, 0.3 * s],
    cen: [0.5 * s, 0.52 * s],
    midL: [0.1 * s, 0.7 * s],
    midR: [0.9 * s, 0.7 * s],
    bot: [0.5 * s, 0.92 * s],
  } as const;

  const face = (pts: ReadonlyArray<readonly number[]>, fill: string): void => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();
  };

  // Top brightest, right medium, left darkest — mirrors in-world face shading.
  face([P.top, P.right, P.cen, P.left], shade(top, 1.0));
  face([P.left, P.cen, P.bot, P.midL], shade(side, 0.62));
  face([P.cen, P.right, P.midR, P.bot], shade(side, 0.82));

  const url = cv.toDataURL();
  cache.set(cacheKey, url);
  return url;
}

export function blockDisplayName(id: BlockId): string {
  const name = getBlockDef(id).name;
  return name.charAt(0).toUpperCase() + name.slice(1);
}
