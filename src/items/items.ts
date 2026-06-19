import { BlockId, getBlockDef } from '../engine/BlockRegistry';

/**
 * Items are everything that can sit in an inventory slot: pure items (sticks,
 * tools, armor, mob drops) and "block-items" that place a block. Block-items
 * share a single numeric space with pure items: a block-item's id is
 * {@link BLOCK_ITEM_BASE} + its {@link BlockId}, so the inventory and crafting
 * code only ever deal with one `item: number`.
 */

/** Pure (non-block) item ids, 1..99. */
export enum ItemId {
  Stick = 1,
  Coal = 2,
  Leather = 3,
  Bone = 4,
  Feather = 5,
  Gunpowder = 6,
  Porkchop = 7,
  // Tools (tier 1 = wood, tier 2 = stone).
  WoodSword = 10,
  WoodPickaxe = 11,
  WoodAxe = 12,
  WoodShovel = 13,
  StoneSword = 14,
  StonePickaxe = 15,
  StoneAxe = 16,
  StoneShovel = 17,
  // Leather armor (slot 0 head .. 3 feet).
  LeatherHelmet = 20,
  LeatherChestplate = 21,
  LeatherLeggings = 22,
  LeatherBoots = 23,
}

export const BLOCK_ITEM_BASE = 1000;

export type ToolType = 'sword' | 'pickaxe' | 'axe' | 'shovel';
export type ItemKind = 'block' | 'tool' | 'armor' | 'material' | 'food';

export interface ToolProps {
  type: ToolType;
  tier: number; // 1 wood, 2 stone, ...
  attack: number; // damage dealt to mobs
}

export interface ArmorProps {
  slot: number; // 0 head, 1 chest, 2 legs, 3 feet
  defense: number; // armor points (each ≈ 4% damage reduction)
}

export interface ItemDef {
  item: number;
  name: string;
  kind: ItemKind;
  maxStack: number;
  block?: BlockId;
  tool?: ToolProps;
  armor?: ArmorProps;
}

interface PureDef {
  name: string;
  kind: ItemKind;
  maxStack?: number;
  tool?: ToolProps;
  armor?: ArmorProps;
}

const PURE_ITEMS: Record<number, PureDef> = {
  [ItemId.Stick]: { name: 'Stick', kind: 'material' },
  [ItemId.Coal]: { name: 'Coal', kind: 'material' },
  [ItemId.Leather]: { name: 'Leather', kind: 'material' },
  [ItemId.Bone]: { name: 'Bone', kind: 'material' },
  [ItemId.Feather]: { name: 'Feather', kind: 'material' },
  [ItemId.Gunpowder]: { name: 'Gunpowder', kind: 'material' },
  [ItemId.Porkchop]: { name: 'Porkchop', kind: 'food' },

  [ItemId.WoodSword]: { name: 'Wooden Sword', kind: 'tool', maxStack: 1, tool: { type: 'sword', tier: 1, attack: 4 } },
  [ItemId.WoodPickaxe]: { name: 'Wooden Pickaxe', kind: 'tool', maxStack: 1, tool: { type: 'pickaxe', tier: 1, attack: 2 } },
  [ItemId.WoodAxe]: { name: 'Wooden Axe', kind: 'tool', maxStack: 1, tool: { type: 'axe', tier: 1, attack: 3 } },
  [ItemId.WoodShovel]: { name: 'Wooden Shovel', kind: 'tool', maxStack: 1, tool: { type: 'shovel', tier: 1, attack: 2 } },
  [ItemId.StoneSword]: { name: 'Stone Sword', kind: 'tool', maxStack: 1, tool: { type: 'sword', tier: 2, attack: 5 } },
  [ItemId.StonePickaxe]: { name: 'Stone Pickaxe', kind: 'tool', maxStack: 1, tool: { type: 'pickaxe', tier: 2, attack: 3 } },
  [ItemId.StoneAxe]: { name: 'Stone Axe', kind: 'tool', maxStack: 1, tool: { type: 'axe', tier: 2, attack: 4 } },
  [ItemId.StoneShovel]: { name: 'Stone Shovel', kind: 'tool', maxStack: 1, tool: { type: 'shovel', tier: 2, attack: 3 } },

  [ItemId.LeatherHelmet]: { name: 'Leather Helmet', kind: 'armor', maxStack: 1, armor: { slot: 0, defense: 1 } },
  [ItemId.LeatherChestplate]: { name: 'Leather Tunic', kind: 'armor', maxStack: 1, armor: { slot: 1, defense: 3 } },
  [ItemId.LeatherLeggings]: { name: 'Leather Pants', kind: 'armor', maxStack: 1, armor: { slot: 2, defense: 2 } },
  [ItemId.LeatherBoots]: { name: 'Leather Boots', kind: 'armor', maxStack: 1, armor: { slot: 3, defense: 1 } },
};

/** The block-item id that places `block`. */
export function blockItem(block: BlockId): number {
  return BLOCK_ITEM_BASE + block;
}

export function isBlockItem(item: number): boolean {
  return item >= BLOCK_ITEM_BASE;
}

/** The block a block-item places, or null for pure items. */
export function blockOf(item: number): BlockId | null {
  return item >= BLOCK_ITEM_BASE ? ((item - BLOCK_ITEM_BASE) as BlockId) : null;
}

export function getItemDef(item: number): ItemDef {
  if (isBlockItem(item)) {
    const block = (item - BLOCK_ITEM_BASE) as BlockId;
    const bd = getBlockDef(block);
    return {
      item,
      name: titleCase(bd.name),
      kind: 'block',
      maxStack: 64,
      block,
    };
  }
  const p = PURE_ITEMS[item];
  if (!p) return { item, name: `item ${item}`, kind: 'material', maxStack: 64 };
  return {
    item,
    name: p.name,
    kind: p.kind,
    maxStack: p.maxStack ?? 64,
    tool: p.tool,
    armor: p.armor,
  };
}

export function itemName(item: number): string {
  return getItemDef(item).name;
}
export function itemMaxStack(item: number): number {
  return getItemDef(item).maxStack;
}
export function toolOf(item: number): ToolProps | undefined {
  return getItemDef(item).tool;
}
export function armorOf(item: number): ArmorProps | undefined {
  return getItemDef(item).armor;
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
