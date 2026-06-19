import * as THREE from 'three';
import { Tile, TILE_COUNT } from './BlockRegistry';

/**
 * Procedural tile textures packed into a Three.js DataArrayTexture (one tile per
 * array layer). A texture array lets greedy-merged quads tile a single tile
 * across an N×M run via REPEAT wrapping and a per-vertex layer index — which a
 * flat atlas cannot do without bleeding between tiles.
 *
 * Tile/layer order is defined by {@link Tile} in BlockRegistry (the single
 * source of truth); this module renders one layer per entry in that order.
 */

export const TILE_PX = 16;

type RGB = [number, number, number];

function clamp8(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

function jitter(seed: number, amount: number): number {
  const n = Math.sin(seed * 12.9898) * 43758.5453;
  return (n - Math.floor(n) - 0.5) * 2 * amount;
}

/** Deterministic per-pixel hash in [0,1) — used for speckles / ore blobs. */
function hash01(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export function tilePixel(tile: number, px: number, py: number): RGB {
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
    case Tile.Cobblestone: {
      // Grey stones with darker mortar on a coarse 5px grid.
      const j = jitter(px * 13 + py * 29, 20);
      r = 120 + j;
      g = 120 + j;
      b = 124 + j;
      if (px % 5 === 0 || py % 5 === 0 || hash01(px, py) > 0.85) {
        r *= 0.62;
        g *= 0.62;
        b *= 0.62;
      }
      break;
    }
    case Tile.OakLogTop: {
      // Concentric growth rings around the centre.
      const dx = px - 7.5;
      const dy = py - 7.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const ring = (Math.sin(dist * 2.1) + 1) * 0.5; // 0..1
      r = 120 + ring * 40;
      g = 86 + ring * 30;
      b = 48 + ring * 18;
      break;
    }
    case Tile.OakLogSide: {
      // Vertical bark grooves.
      const j = jitter(px * 7, 10);
      const groove = Math.sin(px * 1.7) * 0.5 + 0.5; // vertical streaks
      r = 92 + groove * 34 + j;
      g = 64 + groove * 24 + j;
      b = 38 + groove * 14 + j;
      break;
    }
    case Tile.OakPlanks: {
      // Horizontal planks, 4px tall, with offset vertical seams.
      const j = jitter(px * 5 + py * 17, 10);
      r = 170 + j;
      g = 135 + j;
      b = 82 + j;
      const row = Math.floor(py / 4);
      if (py % 4 === 0) {
        r *= 0.7;
        g *= 0.7;
        b *= 0.7;
      } else if ((px + row * 5) % 8 === 0) {
        r *= 0.82;
        g *= 0.82;
        b *= 0.82;
      }
      break;
    }
    case Tile.OakLeaves: {
      // Dense dark green with noisy holes for depth.
      const j = jitter(px * 19 + py * 23, 26);
      r = 48 + j;
      g = 104 + j;
      b = 42 + j;
      if (hash01(px * 1.3, py * 1.7) > 0.8) {
        r *= 0.62;
        g *= 0.66;
        b *= 0.62;
      }
      break;
    }
    case Tile.Bedrock: {
      // Very dark, high-contrast blocky noise.
      const v = 40 + hash01(px, py) * 70;
      r = v;
      g = v;
      b = v + 4;
      break;
    }
    case Tile.Gravel: {
      // Grey-brown speckle with darker pebbles.
      const j = jitter(px * 11 + py * 19, 22);
      r = 124 + j;
      g = 116 + j;
      b = 108 + j;
      if (hash01(px * 2.1, py * 1.9) > 0.7) {
        r *= 0.7;
        g *= 0.7;
        b *= 0.7;
      }
      break;
    }
    case Tile.CoalOre: {
      // Stone base with clustered near-black specks.
      const j = jitter(px * 13 + py * 29, 14);
      r = 128 + j;
      g = 128 + j;
      b = 130 + j;
      if (hash01(px * 1.7, py * 2.3) > 0.78) {
        r = 30;
        g = 30;
        b = 32;
      }
      break;
    }
    case Tile.IronOre: {
      // Stone base with tan/orange ore specks.
      const j = jitter(px * 13 + py * 29, 14);
      r = 128 + j;
      g = 128 + j;
      b = 130 + j;
      if (hash01(px * 2.3, py * 1.7) > 0.78) {
        r = 206;
        g = 162;
        b = 120;
      }
      break;
    }
    case Tile.Snow: {
      // Near-white with a faint cool tint and gentle jitter.
      const j = jitter(px * 7 + py * 13, 8);
      r = 236 + j;
      g = 240 + j;
      b = 248 + j;
      break;
    }
    case Tile.Wool: {
      const j = jitter(px * 9 + py * 11, 10);
      r = 232 + j;
      g = 232 + j;
      b = 228 + j;
      break;
    }
    case Tile.CraftingTableTop: {
      // Plank base with a dark 4x4 crafting grid overlay.
      const j = jitter(px * 5 + py * 17, 8);
      r = 168 + j;
      g = 132 + j;
      b = 80 + j;
      if (px === 8 || py === 8 || px === 3 || py === 3 || px === 13 || py === 13) {
        r *= 0.5;
        g *= 0.5;
        b *= 0.5;
      }
      break;
    }
    case Tile.CraftingTableSide: {
      // Planks with a tool/saw motif: a darker upper band.
      const j = jitter(px * 7 + py * 13, 8);
      r = 150 + j;
      g = 116 + j;
      b = 72 + j;
      if (py < 5 && (px + py) % 3 === 0) {
        r *= 0.6;
        g *= 0.6;
        b *= 0.6;
      }
      break;
    }
    case Tile.FurnaceSide:
    case Tile.FurnaceTop: {
      // Cobblestone-grey body.
      const j = jitter(px * 13 + py * 23, 16);
      r = 116 + j;
      g = 116 + j;
      b = 120 + j;
      if (px % 5 === 0 || py % 5 === 0) {
        r *= 0.7;
        g *= 0.7;
        b *= 0.7;
      }
      break;
    }
    case Tile.FurnaceFront: {
      // Grey with a dark mouth and glowing embers near the bottom.
      const j = jitter(px * 13 + py * 23, 14);
      r = 116 + j;
      g = 116 + j;
      b = 120 + j;
      if (px >= 4 && px <= 11 && py >= 5 && py <= 12) {
        r = 36;
        g = 30;
        b = 30;
        if (py >= 9 && hash01(px, py) > 0.5) {
          r = 220;
          g = 120;
          b = 30;
        }
      }
      break;
    }
    case Tile.ChestTop: {
      // Wood lid with a darker rim and a latch.
      const j = jitter(px * 7 + py * 5, 8);
      r = 150 + j;
      g = 104 + j;
      b = 52 + j;
      if (px === 0 || py === 0 || px === 15 || py === 15) {
        r *= 0.6;
        g *= 0.6;
        b *= 0.6;
      }
      break;
    }
    case Tile.ChestSide:
    case Tile.ChestFront: {
      const j = jitter(px * 9 + py * 7, 8);
      r = 138 + j;
      g = 94 + j;
      b = 46 + j;
      // Iron band around the middle + latch on the front.
      if (py >= 7 && py <= 9) {
        r = 70;
        g = 60;
        b = 48;
      }
      if (tile === Tile.ChestFront && px >= 7 && px <= 8 && py >= 7 && py <= 10) {
        r = 200;
        g = 200;
        b = 205; // latch
      }
      break;
    }
    case Tile.BedTop: {
      // Red quilt with a pillow band at one end.
      const j = jitter(px * 11 + py * 3, 10);
      r = 190 + j;
      g = 46 + j;
      b = 46 + j;
      if (py < 4) {
        r = 235;
        g = 235;
        b = 235; // pillow
      }
      break;
    }
    case Tile.BedSide: {
      // Red mattress over a wooden frame base.
      const j = jitter(px * 7 + py * 9, 8);
      if (py < 9) {
        r = 180 + j;
        g = 44 + j;
        b = 44 + j; // mattress
      } else {
        r = 120 + j;
        g = 84 + j;
        b = 48 + j; // wood frame
      }
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
