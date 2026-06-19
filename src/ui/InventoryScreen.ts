import { Inventory, ItemStack, INV_SIZE } from '../items/Inventory';
import { itemIconDataURL } from '../items/itemIcons';
import { itemName, itemMaxStack, armorOf, getItemDef } from '../items/items';
import { RECIPES, matchRecipe, recipeIngredients, needsTable, Recipe } from '../items/recipes';

/**
 * The inventory + crafting screen. Opens as a 2x2 grid (from the inventory key)
 * or a 3x3 grid (from a placed crafting table). Items move by click-to-pick /
 * click-to-place with a cursor stack; the result slot harvests a matched recipe
 * and consumes one of each grid cell. A side recipe list offers one-click
 * crafting straight from the inventory for convenience.
 */

type Region = 'inv' | 'armor' | 'craft' | 'result';

const SLOT = 44;

export class InventoryScreen {
  isOpen = false;
  private gridW = 2;
  private grid: (ItemStack | null)[] = new Array(4).fill(null);
  private cursor: ItemStack | null = null;

  private readonly overlay: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly cursorEl: HTMLElement;
  private readonly slotEls = new Map<string, { el: HTMLElement; count: HTMLElement }>();
  private readonly recipeRows: { el: HTMLElement; recipe: Recipe }[] = [];
  private craftAreaTitle!: HTMLElement;
  private onClose?: () => void;

  constructor(
    private readonly inv: Inventory,
    root: HTMLElement = document.body,
  ) {
    this.overlay = document.createElement('div');
    this.overlay.id = 'inventory-screen';
    this.overlay.style.cssText =
      'position:fixed;inset:0;display:none;align-items:center;justify-content:center;' +
      'background:rgba(0,0,0,0.55);z-index:40;font:13px system-ui,sans-serif;';

    this.panel = document.createElement('div');
    this.panel.style.cssText =
      'background:#c6c6c6;border:4px solid #373737;border-radius:6px;padding:14px;' +
      'display:flex;gap:16px;box-shadow:0 10px 40px rgba(0,0,0,0.5);';
    this.overlay.appendChild(this.panel);

    this.cursorEl = document.createElement('div');
    this.cursorEl.style.cssText =
      'position:fixed;width:40px;height:40px;pointer-events:none;z-index:60;' +
      'background-size:34px;background-position:center;background-repeat:no-repeat;display:none;';
    this.overlay.appendChild(this.cursorEl);

    this.buildLayout();

    this.overlay.addEventListener('mousemove', (e) => {
      this.cursorEl.style.left = `${e.clientX - 20}px`;
      this.cursorEl.style.top = `${e.clientY - 20}px`;
    });
    this.overlay.addEventListener('mousedown', (e) => {
      if (e.target === this.overlay) this.close();
    });
    root.appendChild(this.overlay);
    inv.onChange(() => this.render());
  }

  setOnClose(cb: () => void): void {
    this.onClose = cb;
  }

  private buildLayout(): void {
    // Left column: armor (4) + crafting area + recipe list arranged in rows.
    const left = document.createElement('div');
    left.style.cssText = 'display:flex;flex-direction:column;gap:12px;';

    // --- Crafting row: armor | grid | arrow | result ---
    const craftRow = document.createElement('div');
    craftRow.style.cssText = 'display:flex;gap:14px;align-items:center;';

    const armorCol = document.createElement('div');
    armorCol.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
    const armorLabel = document.createElement('div');
    armorLabel.textContent = 'Armor';
    armorLabel.style.cssText = 'color:#333;font-weight:600;font-size:11px;';
    armorCol.appendChild(armorLabel);
    for (let i = 0; i < 4; i++) armorCol.appendChild(this.makeSlot('armor', i));
    craftRow.appendChild(armorCol);

    const craftBox = document.createElement('div');
    this.craftAreaTitle = document.createElement('div');
    this.craftAreaTitle.style.cssText = 'color:#333;font-weight:600;font-size:11px;margin-bottom:4px;';
    craftBox.appendChild(this.craftAreaTitle);
    this.craftGridEl = document.createElement('div');
    craftBox.appendChild(this.craftGridEl);
    craftRow.appendChild(craftBox);

    const arrow = document.createElement('div');
    arrow.textContent = '➜';
    arrow.style.cssText = 'font-size:22px;color:#555;';
    craftRow.appendChild(arrow);

    const resultWrap = document.createElement('div');
    resultWrap.appendChild(this.makeSlot('result', 0));
    craftRow.appendChild(resultWrap);

    left.appendChild(craftRow);

    // --- Inventory: 27 main + 9 hotbar ---
    const invLabel = document.createElement('div');
    invLabel.textContent = 'Inventory';
    invLabel.style.cssText = 'color:#333;font-weight:600;font-size:11px;';
    left.appendChild(invLabel);

    const mainGrid = document.createElement('div');
    mainGrid.style.cssText = `display:grid;grid-template-columns:repeat(9,${SLOT}px);gap:3px;`;
    for (let i = 9; i < INV_SIZE; i++) mainGrid.appendChild(this.makeSlot('inv', i));
    left.appendChild(mainGrid);

    const hotGrid = document.createElement('div');
    hotGrid.style.cssText = `display:grid;grid-template-columns:repeat(9,${SLOT}px);gap:3px;margin-top:6px;`;
    for (let i = 0; i < 9; i++) hotGrid.appendChild(this.makeSlot('inv', i));
    left.appendChild(hotGrid);

    this.panel.appendChild(left);

    // --- Right column: recipe list ---
    const right = document.createElement('div');
    right.style.cssText =
      'width:210px;display:flex;flex-direction:column;gap:4px;max-height:420px;overflow-y:auto;';
    const rLabel = document.createElement('div');
    rLabel.textContent = 'Recipes (click to craft)';
    rLabel.style.cssText = 'color:#333;font-weight:600;font-size:11px;position:sticky;top:0;background:#c6c6c6;';
    right.appendChild(rLabel);
    for (const recipe of RECIPES) {
      const row = document.createElement('div');
      row.dataset.recipe = recipe.id;
      row.style.cssText =
        'display:flex;align-items:center;gap:8px;padding:3px 4px;border-radius:3px;cursor:pointer;';
      const icon = document.createElement('div');
      icon.style.cssText = `width:30px;height:30px;background:#8b8b8b url(${itemIconDataURL(recipe.output.item, 28)}) center/26px no-repeat;border-radius:2px;`;
      const label = document.createElement('span');
      label.style.cssText = 'color:#222;font-size:12px;';
      label.textContent =
        (recipe.output.count > 1 ? `${recipe.output.count}× ` : '') + itemName(recipe.output.item);
      row.append(icon, label);
      row.addEventListener('click', () => this.craftFromInventory(recipe));
      right.appendChild(row);
      this.recipeRows.push({ el: row, recipe });
    }
    this.panel.appendChild(right);
  }

  private craftGridEl!: HTMLElement;

  private makeSlot(region: Region, index: number): HTMLElement {
    const el = document.createElement('div');
    el.dataset.region = region;
    el.dataset.index = String(index);
    el.style.cssText =
      `position:relative;width:${SLOT}px;height:${SLOT}px;box-sizing:border-box;` +
      'background-color:#8b8b8b;border:2px solid #6f6f6f;border-radius:2px;cursor:pointer;' +
      'background-size:34px;background-position:center;background-repeat:no-repeat;';
    const count = document.createElement('span');
    count.style.cssText =
      'position:absolute;right:2px;bottom:0;color:#fff;font:bold 12px system-ui;text-shadow:1px 1px 2px #000;pointer-events:none;';
    el.appendChild(count);
    el.addEventListener('click', () => this.clickSlot(region, index));
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.rightClickSlot(region, index);
    });
    this.slotEls.set(`${region}:${index}`, { el, count });
    return el;
  }

  // ----- Open / close -----
  open2x2(): void {
    this.gridW = 2;
    this.grid = new Array(4).fill(null);
    this.openCommon('Crafting');
  }
  open3x3(): void {
    this.gridW = 3;
    this.grid = new Array(9).fill(null);
    this.openCommon('Crafting Table');
  }
  private openCommon(title: string): void {
    this.craftAreaTitle.textContent = title;
    this.rebuildCraftGrid();
    this.isOpen = true;
    this.overlay.style.display = 'flex';
    this.render();
  }

  private rebuildCraftGrid(): void {
    this.craftGridEl.replaceChildren();
    this.craftGridEl.style.cssText = `display:grid;grid-template-columns:repeat(${this.gridW},${SLOT}px);gap:3px;`;
    this.slotEls.forEach((_, k) => {
      if (k.startsWith('craft:')) this.slotEls.delete(k);
    });
    for (let i = 0; i < this.gridW * this.gridW; i++) {
      this.craftGridEl.appendChild(this.makeSlot('craft', i));
    }
  }

  close(): void {
    if (!this.isOpen) return;
    // Return crafting-grid + cursor items to the inventory so nothing is lost.
    for (let i = 0; i < this.grid.length; i++) {
      const s = this.grid[i];
      if (s) this.inv.add(s.item, s.count);
      this.grid[i] = null;
    }
    if (this.cursor) {
      this.inv.add(this.cursor.item, this.cursor.count);
      this.cursor = null;
    }
    this.isOpen = false;
    this.overlay.style.display = 'none';
    this.cursorEl.style.display = 'none';
    this.onClose?.();
  }

  toggle2x2(): void {
    if (this.isOpen) this.close();
    else this.open2x2();
  }

  // ----- Slot access -----
  private getStack(region: Region, index: number): ItemStack | null {
    if (region === 'inv') return this.inv.get(index);
    if (region === 'armor') return this.inv.armor[index];
    if (region === 'craft') return this.grid[index];
    return this.currentResult();
  }
  private setStack(region: Region, index: number, stack: ItemStack | null): void {
    if (region === 'inv') this.inv.set(index, stack);
    else if (region === 'armor') this.inv.armor[index] = stack && stack.count > 0 ? stack : null;
    else if (region === 'craft') this.grid[index] = stack && stack.count > 0 ? stack : null;
  }

  private currentResult(): ItemStack | null {
    const items = this.grid.map((s) => (s ? s.item : null));
    const recipe = matchRecipe(items, this.gridW);
    return recipe ? { item: recipe.output.item, count: recipe.output.count } : null;
  }

  // ----- Interaction -----
  private clickSlot(region: Region, index: number): void {
    if (region === 'result') {
      this.harvestResult();
      this.render();
      return;
    }
    const slot = this.getStack(region, index);
    if (this.cursor === null) {
      if (slot) {
        this.cursor = slot;
        this.setStack(region, index, null);
      }
    } else {
      // Armor slots only accept the matching armor piece.
      if (region === 'armor') {
        const a = armorOf(this.cursor.item);
        if (!a || a.slot !== index) return;
      }
      if (slot === null) {
        this.setStack(region, index, this.cursor);
        this.cursor = null;
      } else if (slot.item === this.cursor.item) {
        const max = itemMaxStack(slot.item);
        const move = Math.min(max - slot.count, this.cursor.count);
        slot.count += move;
        this.cursor.count -= move;
        this.setStack(region, index, slot);
        if (this.cursor.count <= 0) this.cursor = null;
      } else {
        this.setStack(region, index, this.cursor);
        this.cursor = slot;
      }
    }
    this.render();
  }

  /**
   * Right-click: with a held stack, drop ONE item into the slot (the Minecraft
   * way to lay out a grid recipe); with an empty cursor, pick up half a stack,
   * or equip an armour piece from the inventory.
   */
  private rightClickSlot(region: Region, index: number): void {
    if (region === 'result') {
      this.harvestResult();
      this.render();
      return;
    }
    const slot = this.getStack(region, index);
    if (this.cursor) {
      if (region === 'armor') {
        const a = armorOf(this.cursor.item);
        if (!a || a.slot !== index) return;
      }
      if (slot === null) {
        this.setStack(region, index, { item: this.cursor.item, count: 1 });
        this.cursor.count -= 1;
      } else if (slot.item === this.cursor.item && slot.count < itemMaxStack(slot.item)) {
        slot.count += 1;
        this.setStack(region, index, slot);
        this.cursor.count -= 1;
      }
      if (this.cursor && this.cursor.count <= 0) this.cursor = null;
    } else if (region === 'inv' && slot && armorOf(slot.item)) {
      this.inv.set(index, null);
      this.inv.equipArmor(slot.item);
    } else if (slot) {
      const half = Math.ceil(slot.count / 2);
      this.cursor = { item: slot.item, count: half };
      slot.count -= half;
      this.setStack(region, index, slot.count > 0 ? slot : null);
    }
    this.render();
  }

  private harvestResult(): void {
    const result = this.currentResult();
    if (!result) return;
    if (this.cursor && (this.cursor.item !== result.item || this.cursor.count + result.count > itemMaxStack(result.item)))
      return;
    if (this.cursor) this.cursor.count += result.count;
    else this.cursor = { item: result.item, count: result.count };
    // Consume one from each filled grid cell.
    for (let i = 0; i < this.grid.length; i++) {
      const s = this.grid[i];
      if (s) {
        s.count -= 1;
        if (s.count <= 0) this.grid[i] = null;
      }
    }
  }

  /** One-click craft straight from the inventory (recipe list). */
  craftFromInventory(recipe: Recipe): boolean {
    if (needsTable(recipe) && this.gridW < 3) return false;
    const need = recipeIngredients(recipe);
    for (const [item, count] of need) if (!this.inv.has(item, count)) return false;
    for (const [item, count] of need) this.inv.remove(item, count);
    this.inv.add(recipe.output.item, recipe.output.count);
    this.render();
    return true;
  }

  // ----- Render -----
  private render(): void {
    if (!this.isOpen) return;
    const paint = (region: Region, index: number, stack: ItemStack | null) => {
      const ref = this.slotEls.get(`${region}:${index}`);
      if (!ref) return;
      ref.el.style.backgroundImage = stack ? `url(${itemIconDataURL(stack.item)})` : 'none';
      ref.count.textContent = stack && stack.count > 1 ? String(stack.count) : '';
    };
    for (let i = 0; i < INV_SIZE; i++) paint('inv', i, this.inv.get(i));
    for (let i = 0; i < 4; i++) paint('armor', i, this.inv.armor[i]);
    for (let i = 0; i < this.grid.length; i++) paint('craft', i, this.grid[i]);
    paint('result', 0, this.currentResult());

    // Cursor.
    if (this.cursor) {
      this.cursorEl.style.display = 'block';
      this.cursorEl.style.backgroundImage = `url(${itemIconDataURL(this.cursor.item)})`;
    } else {
      this.cursorEl.style.display = 'none';
    }

    // Grey out recipes that can't currently be crafted.
    for (const { el, recipe } of this.recipeRows) {
      const canTable = !(needsTable(recipe) && this.gridW < 3);
      let have = canTable;
      if (have) for (const [item, count] of recipeIngredients(recipe)) if (!this.inv.has(item, count)) { have = false; break; }
      el.style.opacity = have ? '1' : '0.4';
    }
  }

  /** Inventory contents the player is holding, for debug/tests. */
  debugState(): unknown {
    return {
      open: this.isOpen,
      gridW: this.gridW,
      cursor: this.cursor,
      result: this.currentResult(),
      defense: this.inv.totalDefense(),
      armor: this.inv.armor.map((s) => (s ? getItemDef(s.item).name : null)),
    };
  }
}
