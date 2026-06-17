import type { MoveInput } from './Player';

/**
 * First-person input: PointerLock mouse-look plus WASD / Space / Shift key
 * tracking. Key events are bound on `window` so held-key movement works; mouse
 * look is only applied while the pointer is locked.
 */
export class Controls {
  yaw = 0; // radians, 0 faces -Z
  pitch = 0;
  locked = false;
  sensitivity = 0.0022;

  private readonly keys = new Set<string>();

  constructor(canvas: HTMLCanvasElement) {
    canvas.addEventListener('click', () => {
      if (!this.locked) void canvas.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch -= e.movementY * this.sensitivity;
      const limit = Math.PI / 2 - 0.01;
      this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
    });

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      // Prevent the page from scrolling on Space while playing.
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
  }

  getInput(): MoveInput {
    const forward =
      (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    const right =
      (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    return {
      forward,
      right,
      jump: this.keys.has('Space'),
      sneak: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
      yaw: this.yaw,
    };
  }
}
