import * as Phaser from "phaser";
import { MINIGAMES } from "../../../../shared/constants";
import { APPLES, applePosition } from "../../../../shared/minigames";
import { Network } from "../net/Network";
import { MinigameScene, textStyle } from "./MinigameScene";
import { P } from "../art/palette";

interface Barrel {
  id: string;
  cx: number;
  cy: number;
  radius: number;
  apples: Phaser.GameObjects.Image[];
  face: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
}

/**
 * APPLE BOBBING
 * Each player has a barrel with 3 apples drifting side to side at different
 * speeds. Your mouth is the ring in the middle: press Space when an apple is
 * inside it. Miss and you get dunked for a moment. First to 5 apples wins!
 *
 * Both screens compute apple positions from the same seed and the server's
 * clock (shared/minigames.ts applePosition), and the server double-checks
 * every bite.
 */
export class AppleBobbing extends MinigameScene {
  protected readonly gameId = "apples" as const;
  private barrels: Barrel[] = [];
  /** serverTime - Date.now(), from the "mg:clock" message. */
  private clockOffset = 0;
  private dunkedUntil = 0;
  private countdown!: Phaser.GameObjects.Text;
  private unbinds: (() => void)[] = [];

  constructor() { super("AppleBobbing"); }

  protected instructions() {
    return `Press Space when an apple floats into the ring. Miss and you get dunked! First to ${MINIGAMES.apples.target} apples wins.`;
  }
  protected formatScore(s: number) { return `${s} 🍎`; }

  protected buildGame() {
    this.countdown = this.add.text(this.area.centerX, this.area.centerY, "", textStyle(64, P.goldLight)).setOrigin(0.5).setDepth(60);
    this.input.keyboard!.on("keydown-SPACE", () => this.bite());
    const room = Network.room!;
    this.unbinds.push(room.onMessage("mg:clock", (m: { now: number }) => { this.clockOffset = m.now - Date.now(); }));
    this.unbinds.push(room.onMessage("apples:bite", (m: { by: string; hit: boolean; slot?: number }) => this.onBite(m)));
    this.events.once("shutdown", () => { this.unbinds.forEach((u) => u()); this.unbinds = []; });
  }

  /** (Re)build one barrel per player, side by side. */
  protected onGameStart() {
    this.barrels.forEach((b) => { b.apples.forEach((a) => a.destroy()); b.face.destroy(); b.label.destroy(); });
    this.barrels = [];
    const ids = [...this.mg.players];
    const a = this.area;
    const radius = Math.min(a.width / (ids.length * 2) - 30, a.height * 0.32);
    ids.forEach((id, i) => {
      const cx = a.x + (a.width / ids.length) * (i + 0.5), cy = a.centerY + 20;
      const g = this.add.graphics();
      // Barrel: wooden sides, water on top.
      g.fillStyle(0x6e4529).fillEllipse(cx, cy + radius * 0.55, radius * 2.3, radius * 1.3);
      g.fillStyle(0x4a2e1c).fillRect(cx - radius * 1.15, cy, radius * 2.3, radius * 0.55);
      g.fillStyle(0x6e4529).fillEllipse(cx, cy, radius * 2.3, radius * 0.9);
      g.fillStyle(0x3f6f8c).fillEllipse(cx, cy, radius * 2.1, radius * 0.75);
      g.fillStyle(0x7fb2c8, 0.5).fillEllipse(cx - radius * 0.4, cy - radius * 0.12, radius * 0.6, radius * 0.12);
      // The target ring (your mouth), drawn on top each frame.
      const face = this.add.graphics().setDepth(5);
      const label = this.add.text(cx, cy - radius * 0.9, id === this.myId ? `${this.nameOf(id)} (you)` : this.nameOf(id), textStyle(16, this.colorOf(id))).setOrigin(0.5);
      const apples = Array.from({ length: APPLES.perBarrel }, () => this.add.image(cx, cy, "apple").setScale(3).setDepth(4));
      this.barrels.push({ id, cx, cy, radius, apples, face, label });
    });
    this.dunkedUntil = 0;
  }

  /** Milliseconds since the apples started, on the server's clock. */
  private elapsed() {
    return Date.now() + this.clockOffset - this.mg.startedAt;
  }

  private bite() {
    if (this.mg.phase !== "playing" || this.elapsed() < 0 || performance.now() < this.dunkedUntil) return;
    Network.room!.send("apples:bite");
  }

  private onBite(m: { by: string; hit: boolean; slot?: number }) {
    const barrel = this.barrels.find((b) => b.id === m.by);
    if (!barrel) return;
    if (m.hit && m.slot !== undefined) {
      // The caught apple pops up out of the water.
      const apple = barrel.apples[m.slot];
      const ghost = this.add.image(apple.x, apple.y, "apple").setScale(3).setDepth(20);
      this.tweens.add({ targets: ghost, y: apple.y - 80, alpha: 0, scale: 4, duration: 500, ease: "Quad.easeOut", onComplete: () => ghost.destroy() });
    } else if (m.by === this.myId) {
      this.dunkedUntil = performance.now() + APPLES.missPenaltyMs;
      this.cameras.main.shake(200, 0.004);
    }
  }

  protected updateGame() {
    const ms = this.elapsed();
    // 3-2-1 before the apples start moving.
    this.countdown.setText(ms < 0 ? String(Math.ceil(-ms / 1000)) : ms < 600 ? "Bob!" : "");

    const mg = this.mg;
    this.barrels.forEach((b, playerIndex) => {
      const gens = (mg.generations.get(b.id) ?? "0,0,0").split(",").map(Number);
      const t = Math.max(0, ms);
      let inRing = false;
      b.apples.forEach((apple, slot) => {
        const x = applePosition(mg.seed, playerIndex, slot, gens[slot] ?? 0, t);
        // Each apple bobs on its own little wave, and sits on its own "lane" so they don't overlap.
        apple.setPosition(b.cx + x * b.radius * 0.95, b.cy + (slot - 1) * b.radius * 0.18 + Math.sin(t / 220 + slot) * 2);
        if (Math.abs(x) <= APPLES.target) inRing = true;
      });
      // The ring glows when an apple is inside it.
      const dunked = b.id === this.myId && performance.now() < this.dunkedUntil;
      b.face.clear();
      b.face.lineStyle(4, dunked ? 0x3f6f8c : inRing ? 0x8be04e : 0xf4d77a, 1);
      b.face.strokeEllipse(b.cx, b.cy, APPLES.target * b.radius * 2.4, b.radius * 0.6);
    });

    const dunked = performance.now() < this.dunkedUntil;
    this.statusText.setText(ms < 0 ? "Get ready…" : dunked ? "Splash! You got dunked…" : "Space when an apple is in YOUR ring!");
  }
}
