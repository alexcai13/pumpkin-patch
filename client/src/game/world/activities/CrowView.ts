import * as Phaser from "phaser";
import { Callbacks } from "@colyseus/sdk";
import { Interpolator } from "../../net/Interpolator";
import type { WorldContext } from "../WorldContext";
import { OVERLAY_DEPTH } from "../../objects/Character";
import { Sound } from "../../audio/Sound";

/**
 * THE CROW: drawn where the server says (smoothed), flapping, with the
 * stolen pumpkin dangling and a shadow on the ground. Run into it to make it
 * drop the pumpkin (server: activities/Crow.ts).
 */
export class CrowView {
  private sprite: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Image;
  private loot: Phaser.GameObjects.Image;
  private interp: Interpolator;
  private lastPhase = "gone";

  constructor(private ctx: WorldContext) {
    const { scene, room } = ctx;
    const c = room.state.crow;
    if (!scene.anims.exists("crow_flap")) {
      scene.anims.create({ key: "crow_flap", frames: [{ key: "crow", frame: 0 }, { key: "crow", frame: 1 }], frameRate: 8, repeat: -1 });
    }
    // Drawn above the world (it flies) but below the dusk tint.
    this.shadow = scene.add.image(0, 0, "shadow").setDepth(2).setAlpha(0.6);
    this.loot = scene.add.image(0, 0, "pumpkin").setScale(0.7).setDepth(OVERLAY_DEPTH - 31);
    this.sprite = scene.add.sprite(0, 0, "crow", 0).setDepth(OVERLAY_DEPTH - 30).play("crow_flap");
    this.interp = new Interpolator(c.x, c.y);
    let px = c.x, py = c.y;
    Callbacks.get(room).onChange(c, () => {
      if (c.x !== px || c.y !== py) { this.interp.push(c.x, c.y); px = c.x; py = c.y; }
    });
    room.onMessage("crow", (m: { event: string }) => Sound.play(m.event === "stole" ? "caw" : "pop"));
  }

  update(time: number) {
    const c = this.ctx.room.state.crow;
    const visible = c.phase !== "gone";
    if (c.phase !== this.lastPhase) {
      // Snap instead of sliding when it (re)appears.
      if (this.lastPhase === "gone") this.interp.push(c.x, c.y, performance.now() - 5000);
      this.lastPhase = c.phase;
    }
    this.sprite.setVisible(visible);
    this.shadow.setVisible(visible && c.phase === "fleeing");
    this.loot.setVisible(visible && c.carrying);
    if (!visible) return;
    const p = this.interp.sample();
    // Hopping: bounce up and down while it's on the run.
    const hop = c.phase === "fleeing" ? Math.abs(Math.sin(time / 140)) * 6 : 0;
    const x = Math.round(p.x), y = Math.round(p.y - 10 - hop);
    this.sprite.setPosition(x, y).setFlipX(!c.facingLeft);
    this.shadow.setPosition(x, Math.round(p.y + 2));
    this.loot.setPosition(x, y + 9);
  }
}
