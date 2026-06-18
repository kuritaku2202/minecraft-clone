/**
 * Minimal heads-up display built from DOM overlays: a centre crosshair, a block
 * break-progress bar, a heart health bar, a damage flash and a death overlay.
 * The held block is shown by the {@link Hotbar}. Kept separate from the WebGL
 * canvas so it is crisp and cheap to update.
 */
const HEART_COUNT = 10; // each heart = 2 HP (20 max)

export class HUD {
  private readonly breakFill: HTMLElement;
  private readonly breakBar: HTMLElement;
  private readonly hearts: HTMLElement[] = [];
  private readonly damageFlash: HTMLElement;
  private readonly deathOverlay: HTMLElement;

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

    // Heart health bar, centred just above the hotbar.
    const heartRow = document.createElement('div');
    heartRow.id = 'hearts';
    heartRow.style.cssText =
      'position:fixed;left:50%;bottom:70px;transform:translateX(-50%);' +
      'display:flex;gap:2px;pointer-events:none;z-index:25;' +
      'font:18px system-ui,sans-serif;text-shadow:0 1px 2px #000;';
    for (let i = 0; i < HEART_COUNT; i++) {
      const h = document.createElement('span');
      h.textContent = '♥';
      this.hearts.push(h);
      heartRow.appendChild(h);
    }

    // Full-screen red damage flash (pulsed on hit).
    this.damageFlash = document.createElement('div');
    this.damageFlash.style.cssText =
      'position:fixed;inset:0;background:rgba(200,0,0,0.35);opacity:0;' +
      'transition:opacity 0.35s;pointer-events:none;z-index:30;';

    // Death overlay.
    this.deathOverlay = document.createElement('div');
    this.deathOverlay.style.cssText =
      'position:fixed;inset:0;display:none;align-items:center;justify-content:center;' +
      'background:rgba(80,0,0,0.55);color:#fff;font:600 34px system-ui,sans-serif;' +
      'text-shadow:0 2px 6px #000;pointer-events:none;z-index:45;';
    this.deathOverlay.textContent = 'You died — respawning…';

    root.append(cross, this.breakBar, heartRow, this.damageFlash, this.deathOverlay);
    this.setHealth(HEART_COUNT * 2);
  }

  /** Update the heart row from current health (0..20). */
  setHealth(health: number): void {
    const full = Math.floor(health / 2);
    const half = health % 2 === 1;
    for (let i = 0; i < HEART_COUNT; i++) {
      const h = this.hearts[i];
      if (i < full) {
        h.textContent = '♥';
        h.style.color = '#ff3b3b';
        h.style.opacity = '1';
      } else if (i === full && half) {
        h.textContent = '♥';
        h.style.color = '#ff9d3b'; // half heart → orange
        h.style.opacity = '1';
      } else {
        h.textContent = '♡';
        h.style.color = '#3a3a3a';
        h.style.opacity = '0.85';
      }
    }
  }

  /** Briefly pulse the red damage vignette. */
  flashDamage(): void {
    this.damageFlash.style.opacity = '1';
    setTimeout(() => {
      this.damageFlash.style.opacity = '0';
    }, 60);
  }

  setDead(dead: boolean): void {
    this.deathOverlay.style.display = dead ? 'flex' : 'none';
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
}
