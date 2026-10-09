import * as Phaser from "phaser";
import { Callbacks } from "@colyseus/sdk";
import { TILE } from "../../../../../shared/constants";
import { PATCH_MAP } from "../../../../../shared/map/patchMap";
import type { WorldContext } from "../WorldContext";
import { FONT } from "../../ui/fonts";
import { OVERLAY_DEPTH } from "../../objects/Character";

const GOAL = PATCH_MAP.giantPumpkin!.goal;

/**
 * In-world side of the GIANT PUMPKIN PUSH: draws the 2x2 pumpkin, keeps its
 * tiles solid, and while you're walking into it sends "giant:push" so the
 * server knows you're pushing. It only rolls when both of you push the same
 * way at once (server: activities/GiantPumpkin.ts).
 */
export class GiantView {
  private sprite: Phaser.GameObjects.Image;
  private goalMarker: Phaser.GameObjects.Graphics;
  private hint: Phaser.GameObjects.Text;
  private blocked: { x: number; y: number } | null = null;
  private lastSent = 0;
  private lastHint = 0;

  constructor(private ctx: WorldContext) {
    const { scene, room } = ctx;
    const g = room.state.giant;
    this.sprite = scene.add.image(0, 0, "giant_pumpkin").setOrigin(0.5, 1);
    // A dashed outline where it needs to go.
    this.goalMarker = scene.add.graphics().setDepth(2);
    this.goalMarker.lineStyle(1, 0xf4d77a, 0.9);
    for (let i = 0; i < 32; i += 4) {
      this.goalMarker.lineBetween(GOAL.x * TILE + i, GOAL.y * TILE, GOAL.x * TILE + i + 2, GOAL.y * TILE);
      this.goalMarker.lineBetween(GOAL.x * TILE + i, (GOAL.y + 2) * TILE, GOAL.x * TILE + i + 2, (GOAL.y + 2) * TILE);
      this.goalMarker.lineBetween(GOAL.x * TILE, GOAL.y * TILE + i, GOAL.x * TILE, GOAL.y * TILE + i + 2);
      this.goalMarker.lineBetween((GOAL.x + 2) * TILE, GOAL.y * TILE + i, (GOAL.x + 2) * TILE, GOAL.y * TILE + i + 2);
    }
    this.hint = scene.add.text(0, 0, "", {
      fontFamily: FONT, fontSize: "7px", color: "#ffe08a", stroke: "#2a1a14", strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(OVERLAY_DEPTH - 1);
    this.place(false);

    let prev = `${g.tx},${g.ty}`;
    Callbacks.get(room).onChange(g, () => {
      const now = `${g.tx},${g.ty}`;
      if (now !== prev) { prev = now; this.place(true); }
    });

    // Reading it: a hint.
    ctx.interactions.add((c) => {
      const inside = c.faceX >= g.tx && c.faceX < g.tx + 2 && c.faceY >= g.ty && c.faceY < g.ty + 2;
      if (!inside || g.phase !== "idle") return null;
      return { label: "Giant pumpkin", use: () => ctx.toast("It's HUGE. Push it together (walk into it at the same time) to roll it onto the dotted spot by the wagon!") };
    });
  }

  /** Move the sprite (rolling if `animate`) and keep its 2x2 tiles solid. */
  private place(animate: boolean) {
    const g = this.ctx.room.state.giant;
    if (this.blocked) this.setBlocked(this.blocked.x, this.blocked.y, false);
    this.setBlocked(g.tx, g.ty, true);
    this.blocked = { x: g.tx, y: g.ty };

    const x = (g.tx + 1) * TILE, y = (g.ty + 2) * TILE;
    this.sprite.setDepth(g.ty * TILE + TILE * 1.5 - 0.1);
    if (animate) {
      this.ctx.scene.tweens.add({ targets: this.sprite, x, y, duration: 330, ease: "Quad.easeOut" });
      // A little wobble so it looks like it rolled.
      this.sprite.setAngle(x < this.sprite.x ? -12 : 12);
      this.ctx.scene.tweens.add({ targets: this.sprite, angle: 0, duration: 380, ease: "Back.easeOut" });
    } else {
      this.sprite.setPosition(x, y);
    }
  }

  private setBlocked(tx: number, ty: number, blocked: boolean) {
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) this.ctx.collision.setBlocked(tx + dx, ty + dy, blocked);
  }

  update() {
    const g = this.ctx.room.state.giant;
    this.sprite.setAlpha(g.phase === "loaded" ? 0.35 : 1);
    this.goalMarker.setVisible(g.phase === "idle");

    // Are we pressed against it right now? Then we're pushing.
    const bump = this.ctx.controller()?.lastBump;
    const now = performance.now();
    const pushing = !!bump && now - bump.at < 120 && bump.tx >= g.tx && bump.tx < g.tx + 2 && bump.ty >= g.ty && bump.ty < g.ty + 2;
    if (pushing && g.phase === "idle" && now - this.lastSent > 120) {
      this.lastSent = now;
      this.ctx.room.send("giant:push", { dir: bump!.dir });
    }

    // Too heavy alone: tell them (not too often).
    const showHint = pushing && g.pushers < 2;
    if (showHint && now - this.lastHint > 2500) this.lastHint = now;
    const visible = showHint || now - this.lastHint < 1500;
    this.hint.setText(visible ? "Too heavy! Push together!" : "").setPosition((g.tx + 1) * TILE, g.ty * TILE - 4);
  }

  setTextResolution(zoom: number) {
    this.hint.setResolution(zoom);
  }
}
