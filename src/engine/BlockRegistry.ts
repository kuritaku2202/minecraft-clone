/**
 * Block type definitions and the texture-atlas tile mapping for each face.
 * Block ids are stored as a single byte per voxel in {@link Chunk}.
 */

export enum BlockId {
  Air = 0,
  Grass = 1,
  Dirt = 2,
  Stone = 3,
}

/** Tile indices into the texture atlas (see textures.ts). */
export const Tile = {
  GrassTop: 0,
  Dirt: 1,
  Stone: 2,
  GrassSide: 3,
} as const;

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
