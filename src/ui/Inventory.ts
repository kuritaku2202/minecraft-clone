import { BlockId, getBlockDef } from '../engine/BlockRegistry';
import { blockIconDataURL, blockDisplayName } from './blockIcons';

/**
 * Creative-style block picker, toggled with E. Shows every available block as a
 * cube icon; clicking one assigns it to the currently selected hotbar slot (via
 * {@link setOnPick}) and closes. While open the game pauses block interaction
 * and releases pointer lock (wired in main.ts).
 */
export class Inventory {
  isOpen = false;

  private readonly overlay: HTMLElement;
  private onPick?: (block: BlockId) => void;
  private onClose?: () => void;

  constructor(blocks: BlockId[], root: HTMLElement = document.body) {
    this.overlay = document.createElement('div');
    this.overlay.id = 'inventory';
    this.overlay.style.cssText =
      'position:fixed;inset:0;display:none;align-items:center;justify-content:center;' +
      'background:rgba(0,0,0,0.55);z-index:40;';

    const panel = document.createElement('div');
    panel.style.cssText =
      'background:#c6c6c6;border:4px solid #373737;border-radius:4px;padding:16px;' +
      'box-shadow:0 8px 32px rgba(0,0,0,0.5);';

    const title = document.createElement('div');
    title.textContent = 'Blocks  ·  click to assign to selected slot  ·  [E] close';
    title.style.cssText =
      'color:#222;font:13px system-ui,sans-serif;margin-bottom:12px;font-weight:600;';

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(6,54px);gap:6px;';

    for (const id of blocks) {
      const cell = document.createElement('button');
      cell.title = blockDisplayName(id);
      cell.dataset.block = String(id);
      cell.setAttribute('aria-label', getBlockDef(id).name);
      cell.style.cssText =
        'width:54px;height:54px;border:2px solid #8b8b8b;border-radius:2px;cursor:pointer;' +
        `background:#8b8b8b url(${blockIconDataURL(id, 44)}) center/40px no-repeat;`;
      cell.addEventListener('mouseenter', () => {
        cell.style.borderColor = '#fff';
      });
      cell.addEventListener('mouseleave', () => {
        cell.style.borderColor = '#8b8b8b';
      });
      cell.addEventListener('click', () => {
        this.onPick?.(id);
        this.close();
      });
      grid.appendChild(cell);
    }

    panel.append(title, grid);
    this.overlay.appendChild(panel);
    // Click on the backdrop (outside the panel) closes.
    this.overlay.addEventListener('mousedown', (e) => {
      if (e.target === this.overlay) this.close();
    });
    root.appendChild(this.overlay);
  }

  setOnPick(cb: (block: BlockId) => void): void {
    this.onPick = cb;
  }

  setOnClose(cb: () => void): void {
    this.onClose = cb;
  }

  open(): void {
    this.isOpen = true;
    this.overlay.style.display = 'flex';
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.overlay.style.display = 'none';
    this.onClose?.();
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }
}
