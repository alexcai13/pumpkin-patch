import { Scene, GameObjects } from "phaser";
import { MAX_PLAYERS } from "../../../../shared/constants";
import { Network } from "../net/Network";
import { FONT } from "../ui/fonts";

/** Events other scenes send to the HUD (via this.game.events). */
export const HudEvents = {
  /** (text: string) — show a short message at the top of the screen. */
  Toast: "hud:toast",
  /** ("ok" | "reconnecting" | "lost") — our own connection status. */
  Connection: "hud:connection",
} as const;

/**
 * Screen-space UI drawn on top of the World at zoom 1 (so text is sharp):
 * room code, "waiting for a friend", toasts, and the disconnected overlay.
 */
export class Hud extends Scene {
  private waitText!: GameObjects.Text;
  private toasts: GameObjects.Text[] = [];
  private overlay?: GameObjects.Container;
  private lastCount = -1;
  private ticketText!: GameObjects.Text;
  private lastTickets = -1;

  constructor() {
    super("Hud");
  }

  create() {
    const code = Network.room?.roomId ?? "?????";
    this.add.text(12, 10, `Room code: ${code}`, textStyle(18, "#ffe08a"));
    this.ticketText = this.add.text(12, 56, "", textStyle(15, "#f4d77a"));
    this.waitText = this.add.text(12, 34, "", textStyle(14, "#f1e3c2"));
    this.add.text(12, this.scale.height - 26, "Move: Arrows / WASD    Run: Shift    Use: E / Space    Emotes: 1-4", textStyle(13, "#f1e3c2"))
      .setAlpha(0.8)
      .setName("help");
    this.layout();
    this.scale.on("resize", this.layout, this);

    const ev = this.game.events;
    ev.on(HudEvents.Toast, this.toast, this);
    ev.on(HudEvents.Connection, this.setConnection, this);
    this.events.once("shutdown", () => {
      ev.off(HudEvents.Toast, this.toast, this);
      ev.off(HudEvents.Connection, this.setConnection, this);
      this.scale.off("resize", this.layout, this);
    });
  }

  private layout() {
    const help = this.children.getByName("help") as GameObjects.Text | null;
    help?.setY(this.scale.height - 26);
    this.overlay?.setPosition(this.scale.width / 2, this.scale.height / 2);
  }

  private setPlayers(count: number) {
    this.waitText.setText(count < MAX_PLAYERS ? "Waiting for a friend… share the code above!" : "");
  }

  update() {
    // Read the player count straight from the synced state each frame, so the
    // HUD is right even if it started after the players arrived.
    const count = Network.room?.state.players?.size ?? 1;
    if (count !== this.lastCount) {
      this.lastCount = count;
      this.setPlayers(count);
    }
    // Ticket counter (pops when it goes up).
    const room = Network.room;
    const tickets = room?.state.players.get(room.sessionId)?.tickets ?? 0;
    if (tickets !== this.lastTickets) {
      const gained = this.lastTickets >= 0 && tickets > this.lastTickets;
      this.lastTickets = tickets;
      this.ticketText.setText(`🎟 ${tickets} tickets`);
      if (gained) {
        this.ticketText.setScale(1.4);
        this.tweens.add({ targets: this.ticketText, scale: 1, duration: 400, ease: "Back.easeOut" });
      }
    }
  }

  private toast(message: string) {
    const t = this.add.text(this.scale.width / 2, 14, message, textStyle(16, "#fff4d6"))
      .setOrigin(0.5, 0)
      .setPadding(10, 6, 10, 6)
      .setBackgroundColor("#2a1a14cc")
      .setAlpha(0);
    // Stack below older toasts.
    this.toasts.push(t);
    this.toasts.forEach((toast, i) => toast.setY(14 + (this.toasts.length - 1 - i) * 34));
    this.tweens.add({ targets: t, alpha: 1, duration: 200 });
    this.tweens.add({
      targets: t, alpha: 0, delay: 3200, duration: 500,
      onComplete: () => { this.toasts = this.toasts.filter((x) => x !== t); t.destroy(); },
    });
  }

  private setConnection(status: "ok" | "reconnecting" | "lost") {
    this.overlay?.destroy();
    this.overlay = undefined;
    if (status === "ok") return;

    const { width, height } = this.scale;
    const bg = this.add.rectangle(0, 0, 420, status === "lost" ? 150 : 90, 0x2a1a14, 0.92).setStrokeStyle(3, 0xe8762b);
    const msg = this.add.text(0, status === "lost" ? -38 : 0,
      status === "lost" ? "Disconnected from the patch" : "Connection lost… reconnecting",
      textStyle(18, "#ffe08a")).setOrigin(0.5);
    const parts: GameObjects.GameObject[] = [bg, msg];
    if (status === "lost") {
      const btn = this.add.text(0, 30, "  Back to title  ", textStyle(18, "#2a1a14"))
        .setOrigin(0.5).setBackgroundColor("#e8762b").setPadding(8, 6, 8, 6)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => window.location.reload());
      parts.push(btn);
    }
    this.overlay = this.add.container(width / 2, height / 2, parts);
  }
}

function textStyle(size: number, color: string) {
  return { fontFamily: FONT, fontSize: `${size}px`, color, stroke: "#2a1a14", strokeThickness: 4 };
}
