import * as Phaser from "phaser";
import { LEAF_COLORS } from "../art/props";

/**
 * Gently falling leaves. A small fixed pool of sprites is recycled (no
 * allocations per frame), which keeps it cheap on Chromebooks.
 *
 * The leaves live in screen space (scrollFactor 0), so they work in any scene
 * regardless of where the camera is.
 */
export class Leaves {
  private leaves: { img: Phaser.GameObjects.Image; vx: number; vy: number; phase: number; spin: number }[] = [];

  /**
   * @param count how many leaves (keep it modest on Chromebooks)
   * @param scale on-screen size of each leaf pixel
   * @param wind  1 = gentle drift; higher = a breezier gust
   */
  constructor(private scene: Phaser.Scene, count: number, private scale = 3, depth = 999_999, private wind = 1) {
    for (let i = 0; i < count; i++) {
      const img = scene.add.image(0, 0, `leaf_${i % LEAF_COLORS.length}`)
        .setScrollFactor(0)
        .setDepth(depth)
        .setScale(scale);
      const leaf = { img, vx: 0, vy: 0, phase: 0, spin: 0 };
      this.reset(leaf, true);
      this.leaves.push(leaf);
    }
  }

  private reset(leaf: Leaves["leaves"][number], anywhere: boolean) {
    const { width, height } = this.scene.scale;
    // Windy leaves blow in from the left edge; calm ones fall from the top.
    const fromSide = !anywhere && this.wind > 1 && Math.random() < 0.6;
    leaf.img.x = fromSide ? -10 : Math.random() * width;
    leaf.img.y = anywhere ? Math.random() * height : fromSide ? Math.random() * height * 0.8 : -10;
    leaf.vx = (10 + Math.random() * 25) * this.wind * this.wind; // drift right, like a breeze
    leaf.vy = 18 + Math.random() * 22;
    leaf.phase = Math.random() * Math.PI * 2;
    leaf.spin = (Math.random() - 0.5) * 3;
  }

  update(deltaMs: number) {
    const dt = deltaMs / 1000;
    const { width, height } = this.scene.scale;
    for (const leaf of this.leaves) {
      leaf.phase += dt * 2;
      // Side-to-side sway on top of the steady drift.
      leaf.img.x += (leaf.vx + Math.sin(leaf.phase) * 20) * dt * (this.scale / 3);
      leaf.img.y += leaf.vy * dt * (this.scale / 3);
      leaf.img.rotation += leaf.spin * dt;
      if (leaf.img.y > height + 10 || leaf.img.x > width + 10) this.reset(leaf, false);
    }
  }
}
