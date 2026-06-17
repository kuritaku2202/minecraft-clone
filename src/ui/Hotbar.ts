import { BlockId } from '../engine/BlockRegistry';
import { blockIconDataURL, blockDisplayName } from './blockIcons';

const SLOT_COUNT = 9;

/**
 * Minecraft-style 9-slot hotbar pinned to the bottom centre. Each slot shows a
 * cube icon for its block; the selected slot is highlighted. Selection is driven
 * by number keys / mouse wheel (wired in main.ts) and emits the held block via
 * {@link setOnChange}. A transient name label fades in above on change.
 */
export class Hotbar {
  readonly slots: BlockId[];
  selected = 0;

  private readonly container: HTMLElement;
  private readonly slotEls: HTMLElement[] = [];
  private readonly nameLabel: HTMLElement;
  private nameTimer = 0;
  private onChange?: (block: BlockId) => void;

  constructor(initial: BlockId[], root: HTMLElement = document.body) {
    this.slots = initial.slice(0, SLOT_COUNT);
    while (this.slots.length < SLOT_COUNT) this.slots.push(BlockId.Air);

    this.container = document.createElement('div');
    this.container.id = 'hotbar';
    this.container.style.cssText =
      'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);' +
      'display:flex;gap:4px;padding:4px;background:rgba(0,0,0,0.35);' +
      'border:2px solid rgba(0,0,0,0.55);border-radius:4px;' +
      'pointer-events:none;z-index:25;';

    for (let i = 0; i < SLOT_COUNT; i++) {
      const slot = document.createElement('div');
      slot.dataset.slot = String(i);
      slot.style.cssText =
        'width:48px;height:48px;background-color:rgba(255,255,255,0.07);' +
        'border:2px solid rgba(120,120,120,0.6);box-sizing:border-box;' +
        'background-size:38px 38px;background-position:center;background-repeat:no-repeat;';
      this.slotEls.push(slot);
      this.container.appendChild(slot);
    }

    this.nameLabel = document.createElement('div');
    this.nameLabel.id = 'hotbar-name';
    this.nameLabel.style.cssText =
      'position:fixed;left:50%;bottom:74px;transform:translateX(-50%);' +
      'color:#fff;font:14px system-ui,sans-serif;text-shadow:1px 1px 2px #000;' +
      'pointer-events:none;z-index:25;opacity:0;transition:opacity 0.3s;';

    root.append(this.container, this.nameLabel);
    for (let i = 0; i < SLOT_COUNT; i++) this.renderSlot(i);
    this.renderSelection();
  }

  setOnChange(cb: (block: BlockId) => void): void {
    this.onChange = cb;
  }

  private renderSlot(i: number): void {
    const id = this.slots[i];
    this.slotEls[i].style.backgroundImage =
      id === BlockId.Air ? 'none' : `url(${blockIconDataURL(id)})`;
  }

  private renderSelection(): void {
    for (let i = 0; i < SLOT_COUNT; i++) {
      const sel = i === this.selected;
      this.slotEls[i].style.borderColor = sel ? '#fff' : 'rgba(120,120,120,0.6)';
      this.slotEls[i].style.boxShadow = sel
        ? '0 0 0 2px rgba(255,255,255,0.55)'
        : 'none';
    }
  }

  private showName(): void {
    const id = this.slots[this.selected];
    if (id === BlockId.Air) {
      this.nameLabel.style.opacity = '0';
      this.nameTimer = 0;
      return;
    }
    this.nameLabel.textContent = blockDisplayName(id);
    this.nameLabel.style.opacity = '1';
    this.nameTimer = 1.6;
  }

  /** Select slot index (wraps); emits onChange when the block changes. */
  select(i: number): void {
    const idx = ((i % SLOT_COUNT) + SLOT_COUNT) % SLOT_COUNT;
    if (idx === this.selected) {
      this.showName();
      return;
    }
    this.selected = idx;
    this.renderSelection();
    this.showName();
    this.onChange?.(this.slots[idx]);
  }

  /** Step selection by wheel direction. */
  scroll(delta: number): void {
    this.select(this.selected + (delta > 0 ? 1 : -1));
  }

  /** Assign a block to a slot; re-emits if it is the selected slot. */
  setSlot(i: number, block: BlockId): void {
    if (i < 0 || i >= SLOT_COUNT) return;
    this.slots[i] = block;
    this.renderSlot(i);
    if (i === this.selected) {
      this.showName();
      this.onChange?.(block);
    }
  }

  selectedBlock(): BlockId {
    return this.slots[this.selected];
  }

  /** Fade the name label out after its timer expires. */
  update(dt: number): void {
    if (this.nameTimer > 0) {
      this.nameTimer -= dt;
      if (this.nameTimer <= 0) this.nameLabel.style.opacity = '0';
    }
  }
}
