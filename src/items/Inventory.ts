import { itemMaxStack, armorOf } from './items';

/** One stack in a slot. */
export interface ItemStack {
  item: number;
  count: number;
}

export const HOTBAR_SIZE = 9;
export const MAIN_SIZE = 27;
export const INV_SIZE = HOTBAR_SIZE + MAIN_SIZE; // 36 (0..8 hotbar, 9..35 main)
export const ARMOR_SLOTS = 4; // 0 head, 1 chest, 2 legs, 3 feet

/**
 * The player's item storage: a 36-slot grid (first 9 are the hotbar) plus 4
 * armor slots. Pure data; a change listener lets the hotbar/HUD/UI refresh.
 */
export class Inventory {
  readonly slots: (ItemStack | null)[] = new Array(INV_SIZE).fill(null);
  readonly armor: (ItemStack | null)[] = new Array(ARMOR_SLOTS).fill(null);
  selected = 0; // hotbar index 0..8

  private listeners: (() => void)[] = [];

  onChange(cb: () => void): void {
    this.listeners.push(cb);
  }
  private changed(): void {
    for (const l of this.listeners) l();
  }

  get(i: number): ItemStack | null {
    return this.slots[i] ?? null;
  }
  set(i: number, stack: ItemStack | null): void {
    this.slots[i] = stack && stack.count > 0 ? stack : null;
    this.changed();
  }

  selectedStack(): ItemStack | null {
    return this.slots[this.selected];
  }
  select(i: number): void {
    this.selected = ((i % HOTBAR_SIZE) + HOTBAR_SIZE) % HOTBAR_SIZE;
    this.changed();
  }

  /** Add items, stacking into existing slots then empties. Returns leftover. */
  add(item: number, count: number): number {
    const max = itemMaxStack(item);
    // Fill existing matching stacks first.
    for (let i = 0; i < INV_SIZE && count > 0; i++) {
      const s = this.slots[i];
      if (s && s.item === item && s.count < max) {
        const room = max - s.count;
        const put = Math.min(room, count);
        s.count += put;
        count -= put;
      }
    }
    // Then empty slots.
    for (let i = 0; i < INV_SIZE && count > 0; i++) {
      if (!this.slots[i]) {
        const put = Math.min(max, count);
        this.slots[i] = { item, count: put };
        count -= put;
      }
    }
    this.changed();
    return count;
  }

  countOf(item: number): number {
    let n = 0;
    for (const s of this.slots) if (s && s.item === item) n += s.count;
    return n;
  }

  has(item: number, count: number): boolean {
    return this.countOf(item) >= count;
  }

  /** Remove `count` of an item across slots; returns true if all were removed. */
  remove(item: number, count: number): boolean {
    if (!this.has(item, count)) return false;
    for (let i = 0; i < INV_SIZE && count > 0; i++) {
      const s = this.slots[i];
      if (s && s.item === item) {
        const take = Math.min(s.count, count);
        s.count -= take;
        count -= take;
        if (s.count === 0) this.slots[i] = null;
      }
    }
    this.changed();
    return true;
  }

  /** Decrement one from a slot (placing a block, consuming a grid cell). */
  decrement(i: number, by = 1): void {
    const s = this.slots[i];
    if (!s) return;
    s.count -= by;
    if (s.count <= 0) this.slots[i] = null;
    this.changed();
  }

  // ----- Armor -----
  equipArmor(item: number): boolean {
    const a = armorOf(item);
    if (!a) return false;
    const prev = this.armor[a.slot];
    this.armor[a.slot] = { item, count: 1 };
    if (prev) this.add(prev.item, 1); // swap old piece back into the bag
    this.changed();
    return true;
  }

  totalDefense(): number {
    let d = 0;
    for (const s of this.armor) {
      if (s) {
        const a = armorOf(s.item);
        if (a) d += a.defense;
      }
    }
    return d;
  }
}
