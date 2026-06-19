import { BlockId } from '../engine/BlockRegistry';
import { ItemId, blockItem } from './items';

/**
 * Crafting recipes. Shaped recipes carry a minimal pattern (rows of key chars +
 * a key→item map); shapeless recipes carry an unordered ingredient list. The
 * crafting grid (2x2 inventory or 3x3 table) is matched by trimming its filled
 * bounding box and comparing to each shaped pattern (also its mirror, for axes),
 * or by multiset equality for shapeless recipes.
 */

export interface Stack {
  item: number;
  count: number;
}

export interface Recipe {
  id: string;
  output: Stack;
  /** Minimal grid for shaped recipes (null = empty cell). */
  shape?: (number | null)[][];
  /** Unordered ingredients for shapeless recipes. */
  shapeless?: number[];
  /** Also match the horizontally mirrored shape (tools like the axe). */
  mirror?: boolean;
}

// --- Ingredient aliases ---
const LOG = blockItem(BlockId.OakLog);
const P = blockItem(BlockId.OakPlanks); // planks
const C = blockItem(BlockId.Cobblestone); // cobblestone
const W = blockItem(BlockId.Wool); // wool
const S = ItemId.Stick;
const L = ItemId.Leather;
const _ = null;

function shape(
  output: Stack,
  id: string,
  rows: string[],
  key: Record<string, number>,
  mirror = false,
): Recipe {
  const grid = rows.map((r) => [...r].map((ch) => (ch === ' ' ? _ : key[ch])));
  return { id, output, shape: grid, mirror };
}

export const RECIPES: Recipe[] = [
  // Basics (fit the 2x2 inventory grid).
  { id: 'planks', output: { item: P, count: 4 }, shapeless: [LOG] },
  shape({ item: S, count: 4 }, 'stick', ['x', 'x'], { x: P }),
  shape({ item: blockItem(BlockId.CraftingTable), count: 1 }, 'crafting_table', ['xx', 'xx'], { x: P }),

  // 3x3 blocks.
  shape({ item: blockItem(BlockId.Furnace), count: 1 }, 'furnace', ['xxx', 'x x', 'xxx'], { x: C }),
  shape({ item: blockItem(BlockId.Chest), count: 1 }, 'chest', ['xxx', 'x x', 'xxx'], { x: P }),
  shape({ item: blockItem(BlockId.Bed), count: 1 }, 'bed', ['www', 'ppp'], { w: W, p: P }),

  // Wooden tools.
  shape({ item: ItemId.WoodSword, count: 1 }, 'wood_sword', ['x', 'x', 's'], { x: P, s: S }),
  shape({ item: ItemId.WoodPickaxe, count: 1 }, 'wood_pickaxe', ['xxx', ' s ', ' s '], { x: P, s: S }),
  shape({ item: ItemId.WoodAxe, count: 1 }, 'wood_axe', ['xx', 'xs', ' s'], { x: P, s: S }, true),
  shape({ item: ItemId.WoodShovel, count: 1 }, 'wood_shovel', ['x', 's', 's'], { x: P, s: S }),

  // Stone tools (cobblestone heads).
  shape({ item: ItemId.StoneSword, count: 1 }, 'stone_sword', ['x', 'x', 's'], { x: C, s: S }),
  shape({ item: ItemId.StonePickaxe, count: 1 }, 'stone_pickaxe', ['xxx', ' s ', ' s '], { x: C, s: S }),
  shape({ item: ItemId.StoneAxe, count: 1 }, 'stone_axe', ['xx', 'xs', ' s'], { x: C, s: S }, true),
  shape({ item: ItemId.StoneShovel, count: 1 }, 'stone_shovel', ['x', 's', 's'], { x: C, s: S }),

  // Leather armor.
  shape({ item: ItemId.LeatherHelmet, count: 1 }, 'leather_helmet', ['xxx', 'x x'], { x: L }),
  shape({ item: ItemId.LeatherChestplate, count: 1 }, 'leather_chestplate', ['x x', 'xxx', 'xxx'], { x: L }),
  shape({ item: ItemId.LeatherLeggings, count: 1 }, 'leather_leggings', ['xxx', 'x x', 'x x'], { x: L }),
  shape({ item: ItemId.LeatherBoots, count: 1 }, 'leather_boots', ['x x', 'x x'], { x: L }),
];

/** Trim a flat grid (width w) to the bounding box of non-null cells. */
function trim(grid: (number | null)[], w: number): (number | null)[][] | null {
  const h = grid.length / w;
  let minR = h, maxR = -1, minC = w, maxC = -1;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (grid[r * w + c] != null) {
        minR = Math.min(minR, r);
        maxR = Math.max(maxR, r);
        minC = Math.min(minC, c);
        maxC = Math.max(maxC, c);
      }
    }
  }
  if (maxR < 0) return null; // empty grid
  const out: (number | null)[][] = [];
  for (let r = minR; r <= maxR; r++) {
    const row: (number | null)[] = [];
    for (let c = minC; c <= maxC; c++) row.push(grid[r * w + c]);
    out.push(row);
  }
  return out;
}

function gridsEqual(a: (number | null)[][], b: (number | null)[][]): boolean {
  if (a.length !== b.length || a[0].length !== b[0].length) return false;
  for (let r = 0; r < a.length; r++) {
    for (let c = 0; c < a[0].length; c++) {
      if ((a[r][c] ?? null) !== (b[r][c] ?? null)) return false;
    }
  }
  return true;
}

function mirrorOf(g: (number | null)[][]): (number | null)[][] {
  return g.map((row) => [...row].reverse());
}

function multiset(items: (number | null)[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const it of items) if (it != null) m.set(it, (m.get(it) ?? 0) + 1);
  return m;
}

function multisetEqual(a: Map<number, number>, b: Map<number, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

/** The recipe that matches a flat crafting grid of width w (2 or 3), or null. */
export function matchRecipe(grid: (number | null)[], w: number): Recipe | null {
  const trimmed = trim(grid, w);
  const filled = grid.filter((x) => x != null);
  for (const recipe of RECIPES) {
    if (recipe.shapeless) {
      if (multisetEqual(multiset(filled), multiset(recipe.shapeless))) return recipe;
    } else if (recipe.shape && trimmed) {
      if (gridsEqual(trimmed, recipe.shape)) return recipe;
      if (recipe.mirror && gridsEqual(trimmed, mirrorOf(recipe.shape))) return recipe;
    }
  }
  return null;
}

/** Total ingredient counts for a recipe (for a recipe-book "1-click" craft). */
export function recipeIngredients(recipe: Recipe): Map<number, number> {
  if (recipe.shapeless) return multiset(recipe.shapeless);
  const flat: (number | null)[] = [];
  for (const row of recipe.shape!) for (const cell of row) flat.push(cell);
  return multiset(flat);
}

/** Recipes that need the 3x3 grid (their shape exceeds 2x2). */
export function needsTable(recipe: Recipe): boolean {
  if (!recipe.shape) return false;
  return recipe.shape.length > 2 || recipe.shape.some((r) => r.length > 2);
}
