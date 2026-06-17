/**
 * Minimal heads-up display built from DOM overlays: a centre crosshair, a block
 * break-progress bar, and a held-block label. Kept separate from the WebGL
 * canvas so it is crisp and cheap to update.
 */
export class HUD {
  private readonly breakFill: HTMLElement;
  private readonly breakBar: HTMLElement;
  private readonly heldLabel: HTMLElement;

  constructor(root: HTMLElement = document.body) {
    // Crosshair: two crossing white bars.
    const cross = document.createElement('div');
    cross.id = 'crosshair';
    cross.style.cssText =
      'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);' +
      'width:20px;height:20px;pointer-events:none;z-index:20;';
    const hBar = document.createElement('div');
    hBar.style.cssText =
      'position:absolute;left:0;top:9px;width:20px;height:2px;background:rgba(255,255,255,0.85);';
    const vBar = document.createElement('div');
    vBar.style.cssText =
      'position:absolute;left:9px;top:0;width:2px;height:20px;background:rgba(255,255,255,0.85);';
    cross.append(hBar, vBar);

    // Break progress bar, just below the crosshair.
    this.breakBar = document.createElement('div');
    this.breakBar.id = 'break-bar';
    this.breakBar.style.cssText =
      'position:fixed;left:50%;top:calc(50% + 22px);transform:translateX(-50%);' +
      'width:46px;height:6px;border:1px solid rgba(0,0,0,0.6);background:rgba(0,0,0,0.25);' +
      'pointer-events:none;z-index:20;display:none;';
    this.breakFill = document.createElement('div');
    this.breakFill.style.cssText =
      'width:0%;height:100%;background:#e8e8e8;';
    this.breakBar.appendChild(this.breakFill);

    // Held-block label, bottom centre.
    this.heldLabel = document.createElement('div');
    this.heldLabel.id = 'held-label';
    this.heldLabel.style.cssText =
      'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);' +
      'color:#fff;font:13px system-ui,sans-serif;text-shadow:1px 1px 2px #000;' +
      'pointer-events:none;z-index:20;';

    root.append(cross, this.breakBar, this.heldLabel);
  }

  /** progress in [0,1]; 0 hides the bar. */
  setBreakProgress(progress: number): void {
    if (progress <= 0) {
      this.breakBar.style.display = 'none';
      return;
    }
    this.breakBar.style.display = 'block';
    this.breakFill.style.width = `${Math.min(1, progress) * 100}%`;
  }

  setHeldBlock(name: string): void {
    this.heldLabel.textContent = `Held: ${name}  ·  [1] Grass  [2] Dirt  [3] Stone`;
  }
}
