import * as Phaser from "phaser";
import { Callbacks } from "@colyseus/sdk";
import { TILE, HAYRIDE } from "../../../../../shared/constants";
import { PATCH_MAP } from "../../../../../shared/map/patchMap";
import { Interpolator } from "../../net/Interpolator";
import type { WorldContext } from "../WorldContext";

const DEF = PATCH_MAP.hayride!;
const HALF_W = (DEF.home.w / 2) * TILE;
const HALF_H = (DEF.home.h / 2) * TILE;

/**
 * In-world side of the HAYRIDE: draws the wagon where the server says it is
 * (smoothed), seats riders on it, and offers Board / Hop off.
 * The route and timing are on the server (activities/Hayride.ts).
 */
export class HayrideView {
  readonly wagon: Phaser.GameObjects.Image;
  private interp: Interpolator;
  private homeBlocked = false;
  private lastPhase = "";
  private lastDepartIn = -1;
  /** Smoothed wagon center. */
  x: number;
  y: number;

  constructor(private ctx: WorldContext) {
    const h = ctx.room.state.hayride;
    this.x = h.x; this.y = h.y;
    this.interp = new Interpolator(h.x, h.y);
    // The texture is 64x44; its bottom 32px is the 4x2-tile footprint, so the
    // footprint's center is 28px down from the top.
    this.wagon = ctx.scene.add.image(h.x, h.y, "wagon").setOrigin(0.5, 28 / 44);

    let prevX = h.x, prevY = h.y;
    Callbacks.get(ctx.room).onChange(h, () => {
      if (h.x !== prevX || h.y !== prevY) { this.interp.push(h.x, h.y); prevX = h.x; prevY = h.y; }
    });

    // Riding: Hop off (only when it has stopped).
    ctx.interactions.addFirst(() => {
      const me = ctx.me();
      if (!me || me.riding < 0) return null;
      if (h.phase === "moving") return null;
      return { label: "Hop off", use: () => ctx.room.send("hayride:hop") };
    });
    // Next to the wagon: Board.
    ctx.interactions.add((c) => {
      const me = ctx.me();
      if (!me || me.riding >= 0 || me.seat || h.phase === "moving") return null;
      const cx = c.faceX * TILE + TILE / 2, cy = c.faceY * TILE + TILE / 2;
      if (Math.abs(cx - this.x) < HALF_W && Math.abs(cy - this.y) < HALF_H) {
        return { label: "Board the hayride", use: () => ctx.room.send("hayride:board") };
      }
      return null;
    });
  }

  /** Where a rider in `seat` should be drawn right now. */
  seatPosition(seat: number) {
    const s = HAYRIDE.seats[seat] ?? HAYRIDE.seats[0];
    return { x: this.x + s.x, y: this.y + s.y };
  }

  /** Depth for riders: just above the wagon. */
  get riderDepth() {
    return this.wagon.depth + 0.5;
  }

  update() {
    const h = this.ctx.room.state.hayride;
    const p = this.interp.sample();
    this.x = p.x; this.y = p.y;
    this.wagon.setPosition(Math.round(p.x), Math.round(p.y));
    this.wagon.setFlipX(h.facingLeft);
    // Y-sort by the wagon's bottom row.
    this.wagon.setDepth(p.y + HALF_H - TILE / 2 - 0.1);

    // While parked at home it's solid, like any other object.
    const blocked = h.phase === "parked";
    if (blocked !== this.homeBlocked) {
      this.homeBlocked = blocked;
      for (let dy = 0; dy < DEF.home.h; dy++) {
        for (let dx = 0; dx < DEF.home.w; dx++) this.ctx.collision.setBlocked(DEF.home.x + dx, DEF.home.y + dy, blocked);
      }
    }

    // Little status messages for riders.
    const me = this.ctx.me();
    const riding = !!me && me.riding >= 0;
    if (h.phase !== this.lastPhase) {
      if (riding && h.phase === "moving") this.ctx.toast("All aboard! Enjoy the ride 🍂");
      if (riding && h.phase === "stopped") this.ctx.toast(`${h.stopName} stop — press E to hop off`);
      if (riding && h.phase === "parked" && this.lastPhase === "moving") this.ctx.toast("Back at the wagon stop — press E to hop off");
      this.lastPhase = h.phase;
    }
    if (riding && h.phase === "parked" && h.departIn !== this.lastDepartIn && h.departIn > 0) {
      this.ctx.toast(`Leaving in ${h.departIn}…`);
    }
    if (riding && h.phase === "parked" && h.departIn === 0 && this.lastDepartIn !== 0) {
      const waiting = [...this.ctx.room.state.players.values()].some((p) => p.riding < 0 && p.connected);
      if (waiting) this.ctx.toast("Waiting for your friend to hop on…");
    }
    this.lastDepartIn = h.departIn;
  }
}
