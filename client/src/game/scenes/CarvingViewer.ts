import * as Phaser from "phaser";
import { CARVE_W, CARVE_H, PLAYER_COLORS } from "../../../../shared/constants";
import { decodeCarving } from "../../../../shared/carving";
import { paintCarving } from "../art/carvingArt";
import { P } from "../art/palette";
import { Network } from "../net/Network";
import { FONT } from "../ui/fonts";

interface ViewerData {
  /** Which carving (index in state.carvings) to show first. */
  index: number;
  onClose?: () => void;
}

/**
 * Look at the jack-o'-lanterns on the porch up close: big, lit, with the
 * carver's name. ← → flips through all of them, E / Esc / click closes.
 */
export class CarvingViewer extends Phaser.Scene {
  private index = 0;
  private onClose?: () => void;
  private tex!: Phaser.Textures.CanvasTexture;
  private image!: Phaser.GameObjects.Image;
  private glow!: Phaser.GameObjects.Image;
  private caption!: Phaser.GameObjects.Text;
  private counter!: Phaser.GameObjects.Text;
  private shownId = "";

  constructor() {
    super("CarvingViewer");
  }

  init(data: ViewerData) {
    this.index = data.index ?? 0;
    this.onClose = data.onClose;
    this.shownId = "";
  }

  create() {
    const { width, height } = this.scale;
    this.add.rectangle(0, 0, width, height, 0x120a08, 0.88).setOrigin(0).setInteractive().on("pointerdown", () => this.close());

    const cell = Math.max(6, Math.min(16, Math.floor(Math.min((width - 60) / CARVE_W, (height - 200) / CARVE_H))));
    const cx = width / 2, cy = height / 2 - 10;

    // Warm candle glow behind the pumpkin, gently flickering.
    this.glow = this.add.image(cx, cy, "glow").setBlendMode(Phaser.BlendModes.ADD).setScale((CARVE_W * cell) / 30).setAlpha(0.7);
    this.tweens.add({ targets: this.glow, alpha: 0.95, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });

    this.add.rectangle(cx, cy - (CARVE_H * cell) / 2 - 4, cell * 3, cell * 3, Number.parseInt(P.stem.slice(1), 16)).setStrokeStyle(3, 0x2a1a14);
    if (this.textures.exists("carve_view")) this.textures.remove("carve_view");
    this.tex = this.textures.createCanvas("carve_view", CARVE_W, CARVE_H)!;
    this.image = this.add.image(cx, cy, "carve_view").setScale(cell);

    this.caption = this.add.text(cx, cy + (CARVE_H * cell) / 2 + 24, "", style(22, P.goldLight)).setOrigin(0.5);
    this.counter = this.add.text(cx, cy + (CARVE_H * cell) / 2 + 54, "", style(14, P.cream)).setOrigin(0.5);

    const kb = this.input.keyboard!;
    kb.on("keydown-LEFT", () => this.step(-1));
    kb.on("keydown-A", () => this.step(-1));
    kb.on("keydown-RIGHT", () => this.step(1));
    kb.on("keydown-D", () => this.step(1));
    for (const k of ["ESC", "E", "SPACE"]) kb.on(`keydown-${k}`, () => this.close());
    this.show();
  }

  private step(dir: number) {
    const count = Network.room?.state.carvings.length ?? 0;
    if (count === 0) return;
    this.index = (this.index + dir + count) % count;
    this.show();
  }

  private show() {
    const carvings = Network.room?.state.carvings;
    if (!carvings || carvings.length === 0) return this.close();
    this.index = Math.min(this.index, carvings.length - 1);
    const c = carvings[this.index];
    this.shownId = c.id;
    paintCarving(this.tex.getContext(), decodeCarving(c.mask), true);
    this.tex.refresh();
    this.caption.setText(`Carved by ${c.owner}`).setColor(PLAYER_COLORS[c.color]?.main ?? P.goldLight);
    this.counter.setText(carvings.length > 1
      ? `${this.index + 1} of ${carvings.length}   ← → to look at the others   ·   E to close`
      : "E to close");
    // A little pop each time you flip.
    this.image.setScale(this.image.scaleX * 0.92);
    this.tweens.add({ targets: this.image, scale: this.image.scaleX / 0.92, duration: 180, ease: "Back.easeOut" });
  }

  update() {
    // If the shown carving got replaced (porch full), refresh.
    const carvings = Network.room?.state.carvings;
    if (carvings && this.shownId && !carvings.some((c) => c.id === this.shownId)) this.show();
  }

  private close() {
    this.input.keyboard?.removeAllListeners();
    this.onClose?.();
    this.scene.stop();
  }
}

function style(size: number, color: string) {
  return { fontFamily: FONT, fontSize: `${size}px`, color, stroke: "#2a1a14", strokeThickness: 5 };
}
