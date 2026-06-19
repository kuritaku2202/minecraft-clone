import { Inventory, HOTBAR_SIZE } from '../items/Inventory';
import { itemIconDataURL } from '../items/itemIcons';
import { itemName } from '../items/items';

/**
 * Bottom-centre hotbar: a thin view over the inventory's first 9 slots. Renders
 * each stack's icon + count, highlights the selected slot, and fades a name
 * label in on selection change. Selection is shared with the inventory model.
 */
export class Hotbar {
  private readonly slotEls: HTMLElement[] = [];
  private readonly countEls: HTMLElement[] = [];
  private readonly nameLabel: HTMLElement;
  private nameTimer = 0;

  constructor(
    private readonly inv: Inventory,
    root: HTMLElement = document.body,
  ) {
    const container = document.createElement('div');
    container.id = 'hotbar';
    container.style.cssText =
      'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);' +
      'display:flex;gap:4px;padding:4px;background:rgba(0,0,0,0.35);' +
      'border:2px solid rgba(0,0,0,0.55);border-radius:4px;' +
      'pointer-events:none;z-index:25;';

    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const slot = document.createElement('div');
      slot.dataset.slot = String(i);
      slot.style.cssText =
        'position:relative;width:48px;height:48px;box-sizing:border-box;' +
        'background-color:rgba(255,255,255,0.07);border:2px solid rgba(120,120,120,0.6);' +
        'background-size:38px 38px;background-position:center;background-repeat:no-repeat;';
      const count = document.createElement('span');
      count.style.cssText =
        'position:absolute;right:2px;bottom:0;color:#fff;font:bold 13px system-ui;' +
        'text-shadow:1px 1px 2px #000;';
      slot.appendChild(count);
      this.slotEls.push(slot);
      this.countEls.push(count);
      container.appendChild(slot);
    }

    this.nameLabel = document.createElement('div');
    this.nameLabel.id = 'hotbar-name';
    this.nameLabel.style.cssText =
      'position:fixed;left:50%;bottom:108px;transform:translateX(-50%);' +
      'color:#fff;font:14px system-ui,sans-serif;text-shadow:1px 1px 2px #000;' +
      'pointer-events:none;z-index:25;opacity:0;transition:opacity 0.3s;';

    root.append(container, this.nameLabel);
    inv.onChange(() => this.render());
    this.render();
  }

  render(): void {
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const stack = this.inv.get(i);
      const el = this.slotEls[i];
      el.style.backgroundImage = stack ? `url(${itemIconDataURL(stack.item)})` : 'none';
      this.countEls[i].textContent = stack && stack.count > 1 ? String(stack.count) : '';
      const sel = i === this.inv.selected;
      el.style.borderColor = sel ? '#fff' : 'rgba(120,120,120,0.6)';
      el.style.boxShadow = sel ? '0 0 0 2px rgba(255,255,255,0.55)' : 'none';
    }
  }

  select(i: number): void {
    const before = this.inv.selected;
    this.inv.select(i);
    if (this.inv.selected !== before || true) this.showName();
  }

  scroll(delta: number): void {
    this.select(this.inv.selected + (delta > 0 ? 1 : -1));
  }

  private showName(): void {
    const stack = this.inv.selectedStack();
    if (!stack) {
      this.nameLabel.style.opacity = '0';
      this.nameTimer = 0;
      return;
    }
    this.nameLabel.textContent = itemName(stack.item);
    this.nameLabel.style.opacity = '1';
    this.nameTimer = 1.6;
  }

  update(dt: number): void {
    if (this.nameTimer > 0) {
      this.nameTimer -= dt;
      if (this.nameTimer <= 0) this.nameLabel.style.opacity = '0';
    }
  }
}
