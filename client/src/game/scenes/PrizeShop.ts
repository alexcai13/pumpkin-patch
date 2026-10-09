import * as Phaser from "phaser";
import { PRIZES, DEFAULT_PUMPKIN, type Prize } from "../../../../shared/prizes";
import { Network } from "../net/Network";
import { Sound } from "../audio/Sound";
import { FONT } from "../ui/fonts";
import { P } from "../art/palette";

interface ShopData { onClose?: () => void }

/** A row in the shop: a real prize, or one of the free "take it off" options. */
interface Row { id: string; kind: "hat" | "pumpkin"; name: string; cost: number; free?: boolean }

const ROWS: Row[] = [
  { id: "", kind: "hat", name: "No hat", cost: 0, free: true },
  ...PRIZES.filter((p) => p.kind === "hat").map((p: Prize) => ({ ...p })),
  { id: DEFAULT_PUMPKIN, kind: "pumpkin", name: "Classic Orange Pumpkins", cost: 0, free: true },
  ...PRIZES.filter((p) => p.kind === "pumpkin").map((p: Prize) => ({ ...p })),
];

const style = (size: number, color: string = P.cream) => ({ fontFamily: FONT, fontSize: `${size}px`, color, stroke: "#2a1a14", strokeThickness: 4 });

/**
 * TICKETS & PRIZES: spend tickets on hats (worn on your head) and pumpkin
 * colors (for pumpkins you carry and your carvings). Click a row, or use
 * ↑ ↓ and Enter. Buying happens on the server (activities/PrizeStand.ts).
 */
export class PrizeShop extends Phaser.Scene {
  private onClose?: () => void;
  private rows: { row: Row; bg: Phaser.GameObjects.Rectangle; status: Phaser.GameObjects.Text }[] = [];
  private selected = 0;
  private ticketText!: Phaser.GameObjects.Text;
  private unbind?: () => void;

  constructor() { super("PrizeShop"); }

  init(data: ShopData) {
    this.onClose = data.onClose;
    this.rows = [];
    this.selected = 0;
  }

  create() {
    const { width, height } = this.scale;
    this.add.rectangle(0, 0, width, height, 0x120a08, 0.85).setOrigin(0).setInteractive();
    // Two columns: hats on the left, pumpkin colors on the right.
    const hats = ROWS.filter((r) => r.kind === "hat"), pumpkins = ROWS.filter((r) => r.kind === "pumpkin");
    const perColumn = Math.max(hats.length, pumpkins.length);
    const panelW = Math.min(width - 16, 760);
    const rowH = Math.max(20, Math.min(36, Math.floor((height - 130) / (perColumn + 1))));
    const panelH = rowH * (perColumn + 1) + 100;
    const x0 = width / 2 - panelW / 2, y0 = Math.max(4, height / 2 - panelH / 2);
    this.add.rectangle(width / 2, y0 + panelH / 2, panelW, panelH, 0x2a1a14, 0.97).setStrokeStyle(4, 0x8a4f8f);
    this.add.text(width / 2, y0 + 8, "🎟 Tickets & Prizes", style(22, P.goldLight)).setOrigin(0.5, 0);
    this.ticketText = this.add.text(width / 2, y0 + 38, "", style(15)).setOrigin(0.5, 0);

    const colW = (panelW - 36) / 2;
    const y = [hats, pumpkins].reduce((bottom, column, c) => {
      const cx = x0 + 12 + c * (colW + 12);
      let yy = y0 + 64;
      this.add.text(cx + 4, yy, c === 0 ? "Hats" : "Pumpkin colors", style(14, P.goldLight));
      yy += rowH * 0.9;
      for (const row of column) {
        const i = ROWS.indexOf(row);
        const bg = this.add.rectangle(cx + colW / 2, yy + rowH / 2, colW, rowH - 4, 0x4a2e1c).setInteractive({ useHandCursor: true });
        bg.on("pointerdown", () => { this.selected = i; this.choose(); });
        bg.on("pointerover", () => { this.selected = i; });
        const iconKey = row.kind === "hat" ? (row.id ? `hat_${row.id}` : "") : `pumpkin_${row.id}`;
        if (iconKey) this.add.image(cx + 18, yy + rowH / 2, iconKey).setScale(Math.max(1, Math.floor(rowH / 16)));
        this.add.text(cx + 38, yy + rowH / 2, row.name.replace(" Pumpkins", ""), style(14)).setOrigin(0, 0.5);
        const status = this.add.text(cx + colW - 8, yy + rowH / 2, "", style(13)).setOrigin(1, 0.5);
        this.rows[i] = { row, bg, status };
        yy += rowH;
      }
      return Math.max(bottom, yy);
    }, 0);
    this.add.text(width / 2, y + 8, "Click or ↑ ↓ + Enter  ·  Esc to close", style(12)).setOrigin(0.5, 0).setAlpha(0.8);

    const kb = this.input.keyboard!;
    kb.on("keydown-UP", () => { this.selected = (this.selected + ROWS.length - 1) % ROWS.length; });
    kb.on("keydown-DOWN", () => { this.selected = (this.selected + 1) % ROWS.length; });
    // ← → jump between the two columns.
    const hatCount = ROWS.filter((r) => r.kind === "hat").length;
    kb.on("keydown-LEFT", () => { if (this.selected >= hatCount) this.selected = Math.min(this.selected - hatCount, hatCount - 1); });
    kb.on("keydown-RIGHT", () => { if (this.selected < hatCount) this.selected = Math.min(this.selected + hatCount, ROWS.length - 1); });
    kb.on("keydown-ENTER", () => this.choose());
    kb.on("keydown-SPACE", () => this.choose());
    kb.on("keydown-ESC", () => this.close());
    kb.on("keydown-E", () => this.close());
    this.unbind = Network.room!.onMessage("shop:bought", () => Sound.play("coin"));
    this.events.once("shutdown", () => { this.unbind?.(); kb.removeAllListeners(); });
  }

  private me() { return Network.room!.state.players.get(Network.room!.sessionId); }

  private owns(row: Row) {
    const me = this.me();
    return row.free || (!!me && me.owned.split(",").includes(row.id));
  }

  private wearing(row: Row) {
    const me = this.me();
    if (!me) return false;
    return row.kind === "hat" ? me.hat === row.id : me.pumpkinColor === row.id;
  }

  /** Buy it (if you don't own it) or put it on (if you do). */
  private choose() {
    const { row } = this.rows[this.selected];
    Sound.play("click");
    if (this.owns(row)) Network.room!.send("shop:equip", { id: row.id });
    else Network.room!.send("shop:buy", { id: row.id });
  }

  update() {
    const me = this.me();
    if (!me) return;
    this.ticketText.setText(`You have ${me.tickets} tickets`);
    this.rows.forEach(({ row, bg, status }, i) => {
      const wearing = this.wearing(row), owned = this.owns(row);
      status.setText(wearing ? "✓ Using" : owned ? "Use" : `${row.cost} 🎟`);
      status.setColor(wearing ? "#8be04e" : owned ? P.cream : me.tickets >= row.cost ? P.goldLight : "#c98a7a");
      bg.setFillStyle(i === this.selected ? 0x8a4f8f : 0x4a2e1c);
    });
  }

  private close() {
    this.onClose?.();
    this.scene.stop();
  }
}
