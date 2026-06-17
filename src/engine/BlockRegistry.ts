/**
 * Block type definitions and the texture-atlas tile mapping for each face.
 * Block ids are stored as a single byte per voxel in {@link Chunk}.
 */

export enum BlockId {
  Air = 0,
  Grass = 1,
  Dirt = 2,
  Stone = 3,
  Water = 4,
  Sand = 5,
  Cobblestone = 6,
  OakLog = 7,
  OakPlanks = 8,
  OakLeaves = 9,
  Bedrock = 10,
  Gravel = 11,
  CoalOre = 12,
  IronOre = 13,
  Snow = 14,
}

/**
 * Tile indices into the texture array (see textures.ts). Single source of truth
 * for layer order; textures.ts imports it so the array texture is built to
 * match.
 */
export const Tile = {
  GrassTop: 0,
  Dirt: 1,
  Stone: 2,
  GrassSide: 3,
  Water: 4,
  Sand: 5,
  Cobblestone: 6,
  OakLogTop: 7,
  OakLogSide: 8,
  OakPlanks: 9,
  OakLeaves: 10,
  Bedrock: 11,
  Gravel: 12,
  CoalOre: 13,
  IronOre: 14,
  Snow: 15,
} as const;

/** Total tiles (texture-array layers). Keep in sync with {@link Tile}. */
export const TILE_COUNT = 16;

export type FaceKey = 'top' | 'bottom' | 'side';

export interface BlockDef {
  id: BlockId;
  name: string;
  /** Whether entities collide with this block. */
  solid: boolean;
  /** Whether neighbouring faces should still be drawn through this block. */
  transparent: boolean;
  /** Atlas tile index per face group. */
  tiles: Record<FaceKey, number>;
}

export const BLOCKS: Record<BlockId, BlockDef> = {
  [BlockId.Air]: {
    id: BlockId.Air,
    name: 'air',
    solid: false,
    transparent: true,
    tiles: { top: 0, bottom: 0, side: 0 },
  },
  [BlockId.Grass]: {
    id: BlockId.Grass,
    name: 'grass',
    solid: true,
    transparent: false,
    tiles: { top: Tile.GrassTop, bottom: Tile.Dirt, side: Tile.GrassSide },
  },
  [BlockId.Dirt]: {
    id: BlockId.Dirt,
    name: 'dirt',
    solid: true,
    transparent: false,
    tiles: { top: Tile.Dirt, bottom: Tile.Dirt, side: Tile.Dirt },
  },
  [BlockId.Stone]: {
    id: BlockId.Stone,
    name: 'stone',
    solid: true,
    transparent: false,
    tiles: { top: Tile.Stone, bottom: Tile.Stone, side: Tile.Stone },
  },
  // Water is transparent (rendered in a separate semi-transparent pass) and does
  // not collide, so the player can move into it and see terrain underwater.
  [BlockId.Water]: {
    id: BlockId.Water,
    name: 'water',
    solid: false,
    transparent: true,
    tiles: { top: Tile.Water, bottom: Tile.Water, side: Tile.Water },
  },
  [BlockId.Sand]: {
    id: BlockId.Sand,
    name: 'sand',
    solid: true,
    transparent: false,
    tiles: { top: Tile.Sand, bottom: Tile.Sand, side: Tile.Sand },
  },
  [BlockId.Cobblestone]: {
    id: BlockId.Cobblestone,
    name: 'cobblestone',
    solid: true,
    transparent: false,
    tiles: { top: Tile.Cobblestone, bottom: Tile.Cobblestone, side: Tile.Cobblestone },
  },
  // Oak log: growth rings on the cut ends (top/bottom), bark on the sides.
  [BlockId.OakLog]: {
    id: BlockId.OakLog,
    name: 'oak log',
    solid: true,
    transparent: false,
    tiles: { top: Tile.OakLogTop, bottom: Tile.OakLogTop, side: Tile.OakLogSide },
  },
  [BlockId.OakPlanks]: {
    id: BlockId.OakPlanks,
    name: 'oak planks',
    solid: true,
    transparent: false,
    tiles: { top: Tile.OakPlanks, bottom: Tile.OakPlanks, side: Tile.OakPlanks },
  },
  // Leaves render as opaque (fast-graphics style) so internal faces still cull.
  [BlockId.OakLeaves]: {
    id: BlockId.OakLeaves,
    name: 'oak leaves',
    solid: true,
    transparent: false,
    tiles: { top: Tile.OakLeaves, bottom: Tile.OakLeaves, side: Tile.OakLeaves },
  },
  [BlockId.Bedrock]: {
    id: BlockId.Bedrock,
    name: 'bedrock',
    solid: true,
    transparent: false,
    tiles: { top: Tile.Bedrock, bottom: Tile.Bedrock, side: Tile.Bedrock },
  },
  [BlockId.Gravel]: {
    id: BlockId.Gravel,
    name: 'gravel',
    solid: true,
    transparent: false,
    tiles: { top: Tile.Gravel, bottom: Tile.Gravel, side: Tile.Gravel },
  },
  [BlockId.CoalOre]: {
    id: BlockId.CoalOre,
    name: 'coal ore',
    solid: true,
    transparent: false,
    tiles: { top: Tile.CoalOre, bottom: Tile.CoalOre, side: Tile.CoalOre },
  },
  [BlockId.IronOre]: {
    id: BlockId.IronOre,
    name: 'iron ore',
    solid: true,
    transparent: false,
    tiles: { top: Tile.IronOre, bottom: Tile.IronOre, side: Tile.IronOre },
  },
  [BlockId.Snow]: {
    id: BlockId.Snow,
    name: 'snow',
    solid: true,
    transparent: false,
    tiles: { top: Tile.Snow, bottom: Tile.Snow, side: Tile.Snow },
  },
};

export function getBlockDef(id: number): BlockDef {
  return BLOCKS[id as BlockId] ?? BLOCKS[BlockId.Air];
}

/** Solid blocks block movement (used later by physics). */
export function isSolid(id: number): boolean {
  return getBlockDef(id).solid;
}

/**
 * Opaque blocks fully hide the faces of neighbours, so adjacent faces can be
 * culled during meshing. Air and (future) transparent blocks return false.
 */
export function isOpaque(id: number): boolean {
  return !getBlockDef(id).transparent;
}

export function tileForFace(id: number, face: FaceKey): number {
  return getBlockDef(id).tiles[face];
}
