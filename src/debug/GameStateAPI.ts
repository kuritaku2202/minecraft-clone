/**
 * Lightweight monitoring surface so an external agent (or the in-page debug
 * handle) can observe the running game: current FPS, player position, chunk
 * counts, and a stream of block-edit events.
 *
 * A real WebSocket server can't run inside the browser, so the stream is
 * published over a BroadcastChannel ("minecraft-clone"); another tab or a
 * harness page can subscribe to it. The latest snapshot is also kept in memory
 * for synchronous polling.
 */

export interface GameState {
  fps: number;
  position: [number, number, number];
  chunk: [number, number];
  chunksLoaded: number;
  chunksMeshed: number;
  blockEdits: number;
}

export interface BlockEditEvent {
  t: number;
  x: number;
  y: number;
  z: number;
  id: number;
}

export class GameStateAPI {
  private channel: BroadcastChannel | null = null;
  private edits = 0;
  private readonly editLog: BlockEditEvent[] = [];
  private latest: GameState | null = null;

  constructor() {
    try {
      this.channel = new BroadcastChannel('minecraft-clone');
    } catch {
      this.channel = null; // not available in this environment
    }
  }

  recordBlockEdit(x: number, y: number, z: number, id: number): void {
    this.edits++;
    const event: BlockEditEvent = { t: Date.now(), x, y, z, id };
    this.editLog.push(event);
    if (this.editLog.length > 256) this.editLog.shift();
    this.channel?.postMessage({ type: 'block-edit', ...event });
  }

  /** Publish a fresh snapshot (call this throttled, a few times a second). */
  publish(state: GameState): void {
    this.latest = state;
    this.channel?.postMessage({ type: 'state', ...state });
  }

  getState(): GameState | null {
    return this.latest;
  }

  get blockEdits(): number {
    return this.edits;
  }

  recentEdits(limit = 16): BlockEditEvent[] {
    return this.editLog.slice(-limit);
  }
}
