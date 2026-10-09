import * as Phaser from "phaser";
import { TILE, WALK_STEP_MS, RUN_STEP_MS, Dir } from "../../../../shared/constants";
import type { CollisionGrid } from "../../../../shared/map/collision";
import type { Character } from "../objects/Character";

const DIR_VECTORS: Record<Dir, { dx: number; dy: number }> = {
  [Dir.Down]: { dx: 0, dy: 1 },
  [Dir.Left]: { dx: -1, dy: 0 },
  [Dir.Right]: { dx: 1, dy: 0 },
  [Dir.Up]: { dx: 0, dy: -1 },
};

/**
 * If you tap a direction you're not facing, you turn in place first (like the
 * classic handheld games). Holding it longer than this starts walking.
 */
const TURN_DELAY_MS = 90;

/**
 * Moves YOUR character tile-by-tile with the keyboard (arrows or WASD,
 * Shift to run). Movement is grid-locked: each step slides smoothly from one
 * tile center to the next, and you can only start a step into a free tile.
 */
export class PlayerController {
  /** Current tile (or the tile we're stepping FROM). */
  tileX: number;
  tileY: number;
  moving = false;
  running = false;
  /** When false, keyboard input is ignored (menus, minigames, hayride...). */
  enabled = true;

  private fromX = 0; private fromY = 0;
  private toX = 0; private toY = 0;
  private progress = 0; // 0..1 along the current step
  private turnTimer = 0;
  /** Directions currently held, most recent last, so the newest key wins. */
  private held: Dir[] = [];
  private shift: Phaser.Input.Keyboard.Key;

  constructor(scene: Phaser.Scene, private character: Character, private collision: CollisionGrid) {
    this.tileX = Math.floor(character.x / TILE);
    this.tileY = Math.floor(character.y / TILE);

    const kb = scene.input.keyboard!;
    this.shift = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    const bind = (codes: number[], dir: Dir) => {
      for (const code of codes) {
        const key = kb.addKey(code);
        key.on("down", () => { this.held = this.held.filter((d) => d !== dir); this.held.push(dir); });
        key.on("up", () => { this.held = this.held.filter((d) => d !== dir); });
      }
    };
    const K = Phaser.Input.Keyboard.KeyCodes;
    bind([K.DOWN, K.S], Dir.Down);
    bind([K.LEFT, K.A], Dir.Left);
    bind([K.RIGHT, K.D], Dir.Right);
    bind([K.UP, K.W], Dir.Up);
    // Losing focus (alt-tab) would leave keys "stuck" down; clear them.
    window.addEventListener("blur", () => { this.held = []; });
  }

  /** Instantly place the character on a tile (spawn, server correction). */
  teleportToTile(tx: number, ty: number) {
    this.tileX = tx;
    this.tileY = ty;
    this.moving = false;
    this.progress = 0;
    this.character.setPosition(tx * TILE + TILE / 2, ty * TILE + TILE / 2);
  }

  /** Tile the character is facing (handy for interactions in phase 2). */
  facingTile() {
    const v = DIR_VECTORS[this.character.dir];
    return { x: this.tileX + v.dx, y: this.tileY + v.dy };
  }

  update(deltaMs: number) {
    const wanted = this.enabled ? this.held[this.held.length - 1] : undefined;
    this.running = this.enabled && this.shift.isDown;
    let remaining = deltaMs;

    if (!this.moving) {
      if (wanted === undefined) {
        this.turnTimer = 0;
      } else if (wanted !== this.character.dir && this.turnTimer <= 0) {
        // Turn first, walk only if the key is still held after a moment.
        this.character.dir = wanted;
        this.turnTimer = TURN_DELAY_MS;
      } else if (this.turnTimer > 0) {
        this.turnTimer -= deltaMs;
      } else {
        this.tryStartStep(wanted);
      }
    }

    // Advance the current step. A loop so that leftover time after reaching
    // a tile flows straight into the next step: no stutter between tiles.
    while (this.moving && remaining > 0) {
      const stepMs = this.running ? RUN_STEP_MS : WALK_STEP_MS;
      const needed = (1 - this.progress) * stepMs;
      if (remaining < needed) {
        this.progress += remaining / stepMs;
        remaining = 0;
      } else {
        remaining -= needed;
        this.progress = 1;
        this.tileX = this.toX;
        this.tileY = this.toY;
        this.moving = false;
        // Keep walking if a direction is still held.
        const next = this.enabled ? this.held[this.held.length - 1] : undefined;
        if (next !== undefined) this.tryStartStep(next);
      }
    }

    const x = this.moving ? this.fromX + (this.toX - this.fromX) * this.progress : this.tileX;
    const y = this.moving ? this.fromY + (this.toY - this.fromY) * this.progress : this.tileY;
    this.character.setPosition(x * TILE + TILE / 2, y * TILE + TILE / 2);
    this.character.setPose(this.character.dir, this.moving, this.running);
  }

  private tryStartStep(dir: Dir) {
    this.character.dir = dir;
    const v = DIR_VECTORS[dir];
    const nx = this.tileX + v.dx;
    const ny = this.tileY + v.dy;
    if (this.collision.isBlocked(nx, ny)) {
      // Bumped into something: face it, don't move.
      this.moving = false;
      return;
    }
    this.fromX = this.tileX; this.fromY = this.tileY;
    this.toX = nx; this.toY = ny;
    this.progress = 0;
    this.moving = true;
  }
}
