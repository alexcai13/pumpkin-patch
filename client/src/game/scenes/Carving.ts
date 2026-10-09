import * as Phaser from "phaser";
import { CARVE_W, CARVE_H } from "../../../../shared/constants";
import { encodeCarving, insidePumpkin } from "../../../../shared/carving";
import { P } from "../art/palette";
import { Network } from "../net/Network";
import { FONT } from "../ui/fonts";

interface CarvingData {
  /** Called when the overlay closes (World re-enables walking). */
  onClose?: () => void;
}

type Tool = "thin" | "thick" | "erase";

/**
 * CARVING STATION overlay.
 * Draw on a 32x24 pixel pumpkin with the mouse (or a finger). Each pixel is
 * either solid pumpkin or carved out. "Light it" previews how it will glow.
 * Done sends the pixels to the server, which puts the pumpkin on the porch
 * for both players.
 */
export class Carving extends Phaser.Scene {
  private pixels = new Uint8Array(CARVE_W * CARVE_H);
  private tex!: Phaser.Textures.CanvasTexture;
  private image!: Phaser.GameObjects.Image;
  private cell = 10;
  private tool: Tool = "thin";
  private lit = false;
  private last: { x: number; y: number } | null = null;
  private toolButtons = new Map<Tool, Phaser.GameObjects.Text>();
  private litButton!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private onClose?: () => void;

  constructor() {
    super("Carving");
  }

  init(data: CarvingData) {
    this.onClose = data.onClose;
    this.pixels = new Uint8Array(CARVE_W * CARVE_H);
    this.tool = "thin";
    this.lit = false;
    this.last = null;
    this.toolButtons.clear();
  }

  create() {
    const { width, height } = this.scale;
    // Dark backdrop that also blocks clicks from reaching anything below.
    this.add.rectangle(0, 0, width, height, 0x1a1110, 0.75).setOrigin(0).setInteractive();

    // Pixel size on screen: as big as fits, capped so it never gets silly.
    this.cell = Math.max(6, Math.min(16, Math.floor(Math.min((width - 40) / CARVE_W, (height - 230) / CARVE_H))));
    const cx = width / 2, cy = height / 2 - 20;

    this.add.text(cx, cy - (CARVE_H * this.cell) / 2 - 58, "Carve your jack-o'-lantern", btnStyle(24, P.goldLight)).setOrigin(0.5);

    // The stem, drawn as a plain rectangle above the canvas.
    this.add.rectangle(cx, cy - (CARVE_H * this.cell) / 2 - 4, this.cell * 3, this.cell * 3, Number.parseInt(P.stem.slice(1), 16))
      .setStrokeStyle(3, 0x2a1a14);

    if (this.textures.exists("carve_canvas")) this.textures.remove("carve_canvas");
    this.tex = this.textures.createCanvas("carve_canvas", CARVE_W, CARVE_H)!;
    this.image = this.add.image(cx, cy, "carve_canvas").setScale(this.cell).setInteractive({ useHandCursor: true });
    this.redraw();

    // Drawing: press and drag. We connect points from one move event to the
    // next so fast strokes don't leave gaps.
    this.image.on("pointerdown", (p: Phaser.Input.Pointer) => { this.last = null; this.paintAt(p); });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => { if (p.isDown) this.paintAt(p); });
    this.input.on("pointerup", () => { this.last = null; });

    // Tool bar
    const toolsY = cy + (CARVE_H * this.cell) / 2 + 30;
    const tools: [Tool | "clear" | "lit", string][] = [["thin", "Thin knife"], ["thick", "Big knife"], ["erase", "Patch up"], ["clear", "Start over"], ["lit", "Light it"]];
    // Lay the buttons out left to right, then shift the whole row to center it.
    const row: Phaser.GameObjects.Text[] = [];
    let x = 0;
    for (const [id, label] of tools) {
      const b = this.button(x, toolsY, label, () => {
        if (id === "clear") { this.pixels.fill(0); this.redraw(); }
        else if (id === "lit") { this.lit = !this.lit; this.redraw(); this.refreshButtons(); }
        else { this.tool = id; this.refreshButtons(); }
      });
      if (id === "lit") this.litButton = b;
      else if (id !== "clear") this.toolButtons.set(id, b);
      row.push(b);
      x += b.width + 12;
    }
    const offset = cx - (x - 12) / 2;
    row.forEach((b) => { b.x += offset; });

    const actionY = toolsY + 52;
    this.button(cx - 70, actionY, "Cancel", () => this.close(), P.woodDark);
    this.button(cx + 30, actionY, "Done!", () => this.done(), P.orange);
    this.hint = this.add.text(cx, actionY + 40, "Click and drag to carve. Esc = cancel, Enter = done", btnStyle(13, P.cream)).setOrigin(0.5);

    this.refreshButtons();
    const kb = this.input.keyboard!;
    kb.on("keydown-ESC", () => this.close());
    kb.on("keydown-ENTER", () => this.done());
  }

  /** A clickable text button; returns it so we can highlight it later. */
  private button(x: number, y: number, label: string, onClick: () => void, bg: string = P.wood) {
    const b = this.add.text(x, y, label, btnStyle(16, P.cream))
      .setOrigin(0, 0.5)
      .setPadding(10, 6, 10, 6)
      .setBackgroundColor(bg)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", onClick);
    return b;
  }

  private refreshButtons() {
    for (const [id, b] of this.toolButtons) b.setBackgroundColor(id === this.tool ? P.orangeDark : P.wood);
    this.litButton.setBackgroundColor(this.lit ? P.goldDark : P.wood);
  }

  private paintAt(p: Phaser.Input.Pointer) {
    const left = this.image.x - (CARVE_W * this.cell) / 2;
    const top = this.image.y - (CARVE_H * this.cell) / 2;
    const gx = Math.floor((p.x - left) / this.cell);
    const gy = Math.floor((p.y - top) / this.cell);
    // Walk from the previous point to this one, painting every cell on the way.
    const from = this.last ?? { x: gx, y: gy };
    const steps = Math.max(Math.abs(gx - from.x), Math.abs(gy - from.y), 1);
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(from.x + ((gx - from.x) * i) / steps);
      const y = Math.round(from.y + ((gy - from.y) * i) / steps);
      this.stamp(x, y);
    }
    this.last = { x: gx, y: gy };
    this.redraw();
  }

  private stamp(x: number, y: number) {
    const size = this.tool === "thick" ? 2 : 1;
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const px = x + dx, py = y + dy;
        if (px < 0 || py < 0 || px >= CARVE_W || py >= CARVE_H || !insidePumpkin(px, py)) continue;
        this.pixels[py * CARVE_W + px] = this.tool === "erase" ? 0 : 1;
      }
    }
  }

  /** Repaint the little canvas: pumpkin body, ribs, and carved holes. */
  private redraw() {
    const ctx = this.tex.getContext();
    ctx.clearRect(0, 0, CARVE_W, CARVE_H);
    for (let y = 0; y < CARVE_H; y++) {
      for (let x = 0; x < CARVE_W; x++) {
        if (!insidePumpkin(x, y)) continue;
        // When "lit", the shell darkens like it's night, so the glow pops.
        const body = this.lit ? P.orangeDark : P.orange;
        const shade = this.lit ? "#7a3414" : P.orangeDark;
        let color: string = body;
        if (this.pixels[y * CARVE_W + x]) color = this.lit ? (((x + y) % 3 === 0) ? "#fff4c2" : P.glow) : "#3a1a0e";
        else if (x === 8 || x === 16 || x === 24) color = shade; // ribs
        else if (!this.lit && y < 6 && x > 6 && x < 12) color = P.orangeLight; // shine
        else if (!insidePumpkin(x, y + 2) || !insidePumpkin(x + 2, y)) color = shade; // shading
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    this.tex.refresh();
  }

  private done() {
    if (!this.pixels.some((v) => v)) {
      this.hint.setText("Carve something first! 🎃").setColor("#ff9a7a");
      return;
    }
    Network.room?.send("carve:submit", { mask: encodeCarving(this.pixels) });
    this.close();
  }

  private close() {
    this.input.keyboard?.removeAllListeners();
    this.onClose?.();
    this.scene.stop();
  }
}

function btnStyle(size: number, color: string) {
  return { fontFamily: FONT, fontSize: `${size}px`, color, stroke: "#2a1a14", strokeThickness: 4 };
}
