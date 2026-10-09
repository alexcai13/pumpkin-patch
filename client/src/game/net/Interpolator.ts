/**
 * Smooths the OTHER player's movement.
 *
 * Their position arrives in bursts ~15 times per second, a little unevenly.
 * Drawing each update directly would look jerky. Instead we keep a short
 * history of (time, position) snapshots and draw them slightly in the past
 * (DELAY_MS), blending between the two snapshots around that moment. As long as
 * a new snapshot arrives within DELAY_MS, movement is perfectly smooth.
 *
 * Tradeoff: the other player appears ~DELAY_MS behind where they really are,
 * which is invisible in a cozy game.
 */
const DELAY_MS = 120;
/** Jumps bigger than this (pixels) snap instantly instead of sliding (teleports, hayride). */
const SNAP_DISTANCE = 48;
/** A pause longer than this between updates means "they had stopped". */
const RESTART_GAP_MS = 150;

interface Snapshot { t: number; x: number; y: number }

export class Interpolator {
  private buffer: Snapshot[] = [];

  constructor(x: number, y: number) {
    this.buffer.push({ t: performance.now(), x, y });
  }

  push(x: number, y: number, now = performance.now()) {
    const last = this.buffer[this.buffer.length - 1];
    if (last && Math.hypot(x - last.x, y - last.y) > SNAP_DISTANCE) {
      this.buffer = []; // teleport: forget the old path
    } else if (last && now - last.t > RESTART_GAP_MS) {
      // They were standing still (no updates) and just started moving again.
      // Re-stamp their resting spot as "one send ago" so the first step eases
      // out from rest instead of jumping most of the way at once.
      this.buffer.push({ t: now - 1000 / 15, x: last.x, y: last.y });
    }
    this.buffer.push({ t: now, x, y });
    // Keep about a second of history; we only ever need the last few.
    while (this.buffer.length > 2 && this.buffer[1].t < now - 1000) this.buffer.shift();
  }

  /** Position to draw right now. */
  sample(now = performance.now()): { x: number; y: number } {
    const renderTime = now - DELAY_MS;
    const buf = this.buffer;

    // Find the two snapshots around renderTime and blend between them.
    for (let i = buf.length - 1; i > 0; i--) {
      const a = buf[i - 1], b = buf[i];
      if (a.t <= renderTime && renderTime <= b.t) {
        const f = (renderTime - a.t) / Math.max(1, b.t - a.t);
        return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
      }
    }
    // renderTime is past our newest snapshot (they stopped, or data is late): hold the newest.
    // Or it's before our oldest (just joined): use the oldest.
    const newest = buf[buf.length - 1];
    return renderTime >= newest.t ? { x: newest.x, y: newest.y } : { x: buf[0].x, y: buf[0].y };
  }
}
