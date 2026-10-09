/**
 * MINIGAME PHYSICS (shared by server and client)
 * ----------------------------------------------
 * Each function here is "pure": same inputs → same result, no randomness
 * except a seeded generator. The SERVER runs them to decide scores (so nobody
 * can cheat), and both CLIENTS run the exact same functions to animate what
 * happened. That's how both screens show the identical throw.
 */

function rng(seed: number) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** Turns a few numbers into one seed. */
export function mixSeed(...parts: number[]) {
  let h = 2166136261;
  for (const p of parts) {
    h ^= Math.floor(p * 1000) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

// ======================================================================= BOWLING
//
// Lane coordinates: x 0 (left gutter) → 100 (right gutter), y 400 (where you
// roll from) → 0 (back of the lane). Pins are little hay bales in a triangle.

export const LANE = { width: 100, length: 400, ballR: 7, pinR: 5 };

/** The 10 pins, front pin first. */
export const PINS: { x: number; y: number }[] = (() => {
  const pins: { x: number; y: number }[] = [];
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i <= row; i++) pins.push({ x: 50 + (i - row / 2) * 16, y: 110 - row * 14 });
  }
  return pins;
})();

export interface BowlingThrow {
  /** Aim angle in radians: negative = left, positive = right. Range ±MAX_AIM. */
  aim: number;
  /** 0..1 from the timing bar. */
  power: number;
}
export const MAX_AIM = 0.16;

export interface BowlingResult {
  /** Where the ball stopped (lane coords). */
  endX: number;
  endY: number;
  /** Indexes into PINS of the pins knocked down. */
  knocked: number[];
  gutter: boolean;
}

/** Roll the ball. `seed` makes the pin chain reactions vary per throw. */
export function rollBowling(t: BowlingThrow, seed: number): BowlingResult {
  const aim = Math.max(-MAX_AIM, Math.min(MAX_AIM, t.aim));
  const power = Math.max(0, Math.min(1, t.power));
  const startX = 50, startY = 390;
  // Weak rolls run out of steam; a full-power roll goes all the way.
  const distance = 250 + power * 160;
  const dx = Math.sin(aim), dy = -Math.cos(aim);
  let endX = startX + dx * distance, endY = startY + dy * distance;

  // Gutter: the ball leaves the lane before reaching the pins.
  let gutter = false;
  const wall = dx < 0 ? LANE.ballR : LANE.width - LANE.ballR;
  if (dx !== 0) {
    const tWall = (wall - startX) / dx;
    if (tWall > 0 && tWall < distance && startY + dy * tWall > 50) {
      gutter = true;
      endX = wall;
      endY = startY + dy * tWall;
    }
  }

  // Pins the ball rolls through: close enough to its straight path, and
  // reached before it stops.
  const knocked = new Set<number>();
  const pathLen = Math.hypot(endX - startX, endY - startY);
  PINS.forEach((pin, i) => {
    const along = (pin.x - startX) * dx + (pin.y - startY) * dy;
    if (along < 0 || along > pathLen + LANE.pinR) return;
    const perp = Math.abs((pin.x - startX) * dy - (pin.y - startY) * dx);
    if (perp <= LANE.ballR + LANE.pinR) knocked.add(i);
  });

  // Chain reaction: a falling pin can topple pins just behind it. Harder
  // rolls make it more likely. Each falling pin gets ONE chance at each
  // neighbour (otherwise repeat tries make it near-certain). Seeded, so the
  // server and both clients get the same result.
  const random = rng(seed);
  const queue = [...knocked];
  while (queue.length) {
    const i = queue.shift()!;
    const from = PINS[i];
    PINS.forEach((pin, j) => {
      if (knocked.has(j)) return;
      const behind = pin.y < from.y + 1;
      if (behind && Math.hypot(pin.x - from.x, pin.y - from.y) < 19 && random() < 0.12 + power * 0.33) {
        knocked.add(j);
        queue.push(j);
      }
    });
  }
  return { endX, endY, knocked: [...knocked].sort((a, b) => a - b), gutter };
}

// ======================================================================= HAY TOSS

export interface TossThrow {
  /** Launch angle in degrees (15-75). */
  angle: number;
  /** 0..1 from the timing bar. */
  power: number;
}
export const TOSS = { minAngle: 15, maxAngle: 75, minSpeed: 8, maxSpeed: 30, gravity: 9.8 };

/** How far the bale flies (meters), ignoring air resistance. */
export function tossDistance(t: TossThrow) {
  const angle = Math.max(TOSS.minAngle, Math.min(TOSS.maxAngle, t.angle));
  const v = TOSS.minSpeed + Math.max(0, Math.min(1, t.power)) * (TOSS.maxSpeed - TOSS.minSpeed);
  const rad = (angle * Math.PI) / 180;
  return (v * v * Math.sin(2 * rad)) / TOSS.gravity;
}

/** Position of the bale (meters) after `time` seconds, for animating the arc. */
export function tossPosition(t: TossThrow, time: number) {
  const v = TOSS.minSpeed + Math.max(0, Math.min(1, t.power)) * (TOSS.maxSpeed - TOSS.minSpeed);
  const rad = (Math.max(TOSS.minAngle, Math.min(TOSS.maxAngle, t.angle)) * Math.PI) / 180;
  const x = v * Math.cos(rad) * time;
  const y = v * Math.sin(rad) * time - 0.5 * TOSS.gravity * time * time;
  return { x, y };
}

/** How long the bale is in the air (seconds). */
export function tossFlightTime(t: TossThrow) {
  const v = TOSS.minSpeed + Math.max(0, Math.min(1, t.power)) * (TOSS.maxSpeed - TOSS.minSpeed);
  const rad = (Math.max(TOSS.minAngle, Math.min(TOSS.maxAngle, t.angle)) * Math.PI) / 180;
  return (2 * v * Math.sin(rad)) / TOSS.gravity;
}

// ======================================================================= APPLE BOBBING
//
// Each player has their own barrel with 3 apples drifting side to side at
// different speeds. Your mouth is the target in the middle: press the button
// while an apple is inside it. A caught apple is replaced by a new (usually
// faster) one, so the round gets harder as you go.

export const APPLES = { perBarrel: 3, target: 0.13, missPenaltyMs: 800 };

/**
 * Horizontal position (-1 left … 1 right) of apple `slot` in `player`'s
 * barrel, `ms` milliseconds after the game started, given how many apples
 * they've caught so far (each catch swaps in a new apple).
 */
export function applePosition(seed: number, player: number, slot: number, generation: number, ms: number) {
  const r = rng(mixSeed(seed, player, slot, generation));
  const period = 900 + r() * 1700 - Math.min(generation, 6) * 70; // ms per sweep
  const phase = r() * Math.PI * 2;
  return Math.sin((ms / period) * Math.PI * 2 + phase);
}

/**
 * Which apple (if any) is inside the target at time `ms`.
 * `generations[slot]` = how many times that slot's apple was replaced.
 */
export function appleInTarget(seed: number, player: number, generations: number[], ms: number): number {
  for (let slot = 0; slot < APPLES.perBarrel; slot++) {
    if (Math.abs(applePosition(seed, player, slot, generations[slot] ?? 0, ms)) <= APPLES.target) return slot;
  }
  return -1;
}
