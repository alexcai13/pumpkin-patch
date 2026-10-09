import { Scene } from "phaser";
import { Leaves } from "../ui/Leaves";

/**
 * CIDER STAND cozy moment: while you're sitting on a bench (with your friend),
 * extra leaves gust across the screen and the edges warm and darken a bit.
 * World handles the gentle camera zoom. Launched/stopped by BenchView.
 */
export class CiderCozy extends Scene {
  private leaves?: Leaves;

  constructor() {
    super("CiderCozy");
  }

  create() {
    const { width, height } = this.scale;
    const vignette = this.add.image(width / 2, height / 2, "vignette").setDisplaySize(width, height).setAlpha(0);
    this.tweens.add({ targets: vignette, alpha: 1, duration: 1500 });
    this.leaves = new Leaves(this, 36, 4, 10, 1.8);
    this.scale.on("resize", () => vignette.setPosition(this.scale.width / 2, this.scale.height / 2).setDisplaySize(this.scale.width, this.scale.height), this);
    this.events.once("shutdown", () => this.scale.off("resize", undefined, this));
  }

  update(_time: number, delta: number) {
    this.leaves?.update(delta);
  }
}
