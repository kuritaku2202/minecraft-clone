import * as THREE from 'three';

/**
 * Procedural tile textures packed into a Three.js DataArrayTexture (one tile per
 * array layer). A texture array lets greedy-merged quads tile a single tile
 * across an N×M run via REPEAT wrapping and a per-vertex layer index — which a
 * flat atlas cannot do without bleeding between tiles.
 */

export const TILE_PX = 16;

/** Layer index per tile (also used as the vertex layer attribute). */
export const Tile = {
  GrassTop: 0,
  Dirt: 1,
  Stone: 2,
  GrassSide: 3,
  Water: 4,
  Sand: 5,
} as const;

const TILE_COUNT = 6;

type RGB = [number, number, number];

function clamp8(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

function jitter(seed: number, amount: number): number {
  const n = Math.sin(seed * 12.9898) * 43758.5453;
  return (n - Math.floor(n) - 0.5) * 2 * amount;
}

function tilePixel(tile: number, px: number, py: number): RGB {
  let r = 0;
  let g = 0;
  let b = 0;
  switch (tile) {
    case Tile.GrassTop: {
      const j = jitter(px * 31 + py * 7, 18);
      r = 70 + j;
      g = 140 + j;
      b = 55 + j;
      break;
    }
    case Tile.Dirt: {
      const j = jitter(px * 17 + py * 23, 16);
      r = 125 + j;
      g = 88 + j;
      b = 58 + j;
      break;
    }
    case Tile.Stone: {
      const j = jitter(px * 13 + py * 29, 14);
      r = 128 + j;
      g = 128 + j;
      b = 130 + j;
      break;
    }
    case Tile.GrassSide: {
      const j = jitter(px * 19 + py * 11, 16);
      // Green overhang along the top rows (low py == top of block once mapped).
      if (py < 4) {
        r = 70 + j;
        g = 140 + j;
        b = 55 + j;
      } else {
        r = 125 + j;
        g = 88 + j;
        b = 58 + j;
      }
      break;
    }
    case Tile.Water: {
      const j = jitter(px * 23 + py * 5, 10);
      r = 40 + j;
      g = 90 + j;
      b = 190 + j;
      break;
    }
    case Tile.Sand: {
      const j = jitter(px * 29 + py * 3, 12);
      r = 218 + j;
      g = 205 + j;
      b = 150 + j;
      break;
    }
  }
  // Darken the 1px ring so per-block boundaries stay visible on merged quads.
  if (px === 0 || py === 0 || px === TILE_PX - 1 || py === TILE_PX - 1) {
    r *= 0.78;
    g *= 0.78;
    b *= 0.78;
  }
  return [r, g, b];
}

export function buildTileArrayTexture(): THREE.DataArrayTexture {
  const layerSize = TILE_PX * TILE_PX * 4;
  const data = new Uint8Array(layerSize * TILE_COUNT);
  for (let tile = 0; tile < TILE_COUNT; tile++) {
    for (let py = 0; py < TILE_PX; py++) {
      for (let px = 0; px < TILE_PX; px++) {
        const [r, g, b] = tilePixel(tile, px, py);
        const idx = (tile * TILE_PX * TILE_PX + py * TILE_PX + px) * 4;
        data[idx] = clamp8(r);
        data[idx + 1] = clamp8(g);
        data[idx + 2] = clamp8(b);
        data[idx + 3] = 255;
      }
    }
  }

  const tex = new THREE.DataArrayTexture(data, TILE_PX, TILE_PX, TILE_COUNT);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
