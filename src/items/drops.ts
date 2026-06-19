import { BlockId } from '../engine/BlockRegistry';
import { ItemId, blockItem } from './items';
import { MobKind } from '../entities/MobType';

/**
 * What breaking a block or killing a mob yields. Stone-family blocks require a
 * pickaxe to drop anything (otherwise they break with no drop, as in Minecraft);
 * most others drop their own block-item. Mob drops are rolled per kill.
 */

const NEEDS_PICKAXE = new Set<number>([
  BlockId.Stone,
  BlockId.Cobblestone,
  BlockId.CoalOre,
  BlockId.IronOre,
  BlockId.Furnace,
]);

export function blockRequiresPickaxe(block: BlockId): boolean {
  return NEEDS_PICKAXE.has(block);
}

/** Item dropped by breaking `block`, or null (no drop / wrong tool). */
export function blockDropItem(block: BlockId, hasPickaxe: boolean): number | null {
  switch (block) {
    case BlockId.Air:
    case BlockId.Water:
    case BlockId.Bedrock:
    case BlockId.OakLeaves:
      return null;
    case BlockId.Grass:
      return blockItem(BlockId.Dirt); // grass block drops dirt
    case BlockId.Stone:
      return hasPickaxe ? blockItem(BlockId.Cobblestone) : null;
    case BlockId.CoalOre:
      return hasPickaxe ? ItemId.Coal : null;
    case BlockId.Cobblestone:
    case BlockId.IronOre:
    case BlockId.Furnace:
      return hasPickaxe ? blockItem(block) : null;
    default:
      return blockItem(block); // dirt, sand, gravel, snow, logs, planks, wool, etc.
  }
}

export interface DropRoll {
  item: number;
  count: number;
}

function roll(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** Items dropped when a mob of `kind` is killed by the player. */
export function mobDrops(kind: MobKind): DropRoll[] {
  switch (kind) {
    case 'pig':
      return [{ item: ItemId.Porkchop, count: roll(1, 3) }];
    case 'cow':
      return [{ item: ItemId.Leather, count: roll(1, 2) }];
    case 'sheep':
      return [{ item: blockItem(BlockId.Wool), count: 1 }];
    case 'chicken':
      return [{ item: ItemId.Feather, count: roll(0, 2) }];
    case 'skeleton':
      return [{ item: ItemId.Bone, count: roll(1, 2) }];
    case 'creeper':
      return [{ item: ItemId.Gunpowder, count: roll(1, 2) }];
    default:
      return []; // zombie / spider / slime / enderman: nothing wired yet
  }
}
