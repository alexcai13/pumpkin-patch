import * as Phaser from "phaser";
import type { PatchRoom } from "../net/Network";
import { OVERLAY_DEPTH } from "../objects/Character";

/** One full day → dusk → night-ish → dawn loop (ms). Change to taste. */
export const CYCLE_MS = 8 * 60 * 1000;

/** Depth of the tint overlay: above the world, below name tags and glows. */
export const TINT_DEPTH = OVERLAY_DEPTH - 20;
/** Glows sit above the tint so they look bright in the dark. */
export const GLOW_DEPTH = OVERLAY_DEPTH - 15;

/** Tint colors at a few key moments (multiplied over the whole screen). */
const KEYS: { t: number; color: [number, number, number]; dark: number }[] = [
  { t: 0.0, color: [255, 255, 255], dark: 0 },    // day
  { t: 0.38, color: [255, 255, 255], dark: 0 },
  { t: 0.5, color: [255, 214, 160], dark: 0.3 },  // golden hour
  { t: 0.62, color: [176, 140, 190], dark: 0.75 }, // dusk
  { t: 0.82, color: [150, 120, 175], dark: 1 },   // deep dusk
  { t: 0.92, color: [230, 200, 190], dark: 0.4 },  // dawn
  { t: 1.0, color: [255, 255, 255], dark: 0 },
];

/**
 * DAY → DUSK LIGHTING
 * A full-screen rectangle with MULTIPLY blending tints everything a little
 * golden, then dusky purple, then back. Both players see the same time of
 * day because it's based on the server's clock (state.startedAt), not each
 * computer's.
 *
 * At dusk, jack-o'-lanterns swap to their lit texture and soft glows fade in
 * (glows use ADD blending and sit above the tint so they shine).
 * Cheap enough for a Chromebook: one rectangle + a handful of sprites.
 */
export class DayCycle {
  private tint: Phaser.GameObjects.Rectangle;
  private glows: { img: Phaser.GameObjects.Image; base: number; phase: number }[] = [];
  private lanterns: Phaser.GameObjects.Image[] = [];
  /** serverNow - Date.now() */
  private clockOffset = 0;
  /** 0 (bright day) … 1 (darkest dusk), read by other systems if useful. */
  darkness = 0;

  constructor(private scene: Phaser.Scene, private room: PatchRoom) {
    const { width, height } = scene.scale;
    this.tint = scene.add.rectangle(0, 0, width, height, 0xffffff)
      .setOrigin(0).setScrollFactor(0).setDepth(TINT_DEPTH).setBlendMode(Phaser.BlendModes.MULTIPLY);
    scene.scale.on("resize", this.resize, this);
    scene.events.once("shutdown", () => scene.scale.off("resize", this.resize, this));

    // Sync clocks: ask the server the time and correct for half the round trip.
    const unbind = room.onMessage("clock:pong", (m: { sent: number; now: number }) => {
      const rtt = Date.now() - m.sent;
      this.clockOffset = m.now + rtt / 2 - Date.now();
    });
    scene.events.once("shutdown", unbind);
    room.send("clock:ping", { sent: Date.now() });
  }

  private resize() {
    this.tint.setSize(this.scene.scale.width, this.scene.scale.height);
  }

  /** A soft light at (x, y) that fades in at dusk (world coords). */
  addGlow(x: number, y: number, scale = 1, base = 0.9) {
    const img = this.scene.add.image(x, y, "glow").setBlendMode(Phaser.BlendModes.ADD).setDepth(GLOW_DEPTH).setScale(scale).setAlpha(0);
    this.glows.push({ img, base, phase: Math.random() * Math.PI * 2 });
    return img;
  }

  /** A jack-o'-lantern that lights up (texture swap) and glows at dusk. */
  addLantern(img: Phaser.GameObjects.Image) {
    this.lanterns.push(img);
    this.addGlow(img.x, img.y - 7, 0.9);
  }

  /** Where we are in the cycle, 0..1. */
  cycleTime() {
    const start = this.room.state.startedAt || Date.now();
    const now = Date.now() + this.clockOffset;
    return (((now - start) % CYCLE_MS) + CYCLE_MS) % CYCLE_MS / CYCLE_MS;
  }

  update(time: number) {
    const t = this.cycleTime();
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].t < t) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const f = Phaser.Math.Clamp((t - a.t) / Math.max(0.0001, b.t - a.t), 0, 1);
    const c = a.color.map((v, k) => Math.round(v + (b.color[k] - v) * f));
    this.darkness = a.dark + (b.dark - a.dark) * f;
    this.tint.setFillStyle((c[0] << 16) | (c[1] << 8) | c[2]);
    this.tint.setVisible(this.darkness > 0.001 || c.some((v) => v < 255));

    const lit = this.darkness > 0.25;
    for (const l of this.lanterns) {
      const key = lit ? "lantern_lit" : "lantern";
      if (l.texture.key !== key) l.setTexture(key);
    }
    // Glows flicker a little, like candles.
    for (const g of this.glows) {
      const flicker = 0.85 + Math.sin(time / 180 + g.phase) * 0.08 + Math.sin(time / 47 + g.phase * 3) * 0.05;
      g.img.setAlpha(Math.max(0, (this.darkness - 0.15) / 0.85) * g.base * flicker);
    }
  }
}
