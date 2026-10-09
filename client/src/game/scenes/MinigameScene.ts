import * as Phaser from "phaser";
import { MINIGAMES, PLAYER_COLORS, type MinigameId } from "../../../../shared/constants";
import type { PlayerState } from "../../../../server/src/rooms/schema/PlayerState";
import { Network } from "../net/Network";
import { FONT } from "../ui/fonts";
import { P } from "../art/palette";

interface MinigameData { onClose?: () => void }

export const textStyle = (size: number, color: string = P.cream) => ({
  fontFamily: FONT, fontSize: `${size}px`, color, stroke: "#2a1a14", strokeThickness: Math.max(3, size / 5),
});

/**
 * Shared frame for every minigame scene (Bowling, AppleBobbing, HayToss).
 * It handles everything that's the same between them:
 *  - the dark backdrop and the play area box
 *  - the live scoreboard and "whose turn" line
 *  - the LOBBY overlay (who's here, Start / Leave)
 *  - the RESULTS overlay (final scores, winner, Play again / Leave)
 *  - closing the scene when you leave or the game is closed
 * Each game only fills in the play area (buildGame / updateGame).
 */
export abstract class MinigameScene extends Phaser.Scene {
  protected abstract readonly gameId: MinigameId;
  /** The rectangle (screen px) the game draws inside. */
  protected area!: Phaser.Geom.Rectangle;
  protected scoreText!: Phaser.GameObjects.Text;
  protected statusText!: Phaser.GameObjects.Text;
  protected helpText!: Phaser.GameObjects.Text;
  private overlay?: Phaser.GameObjects.Container;
  private overlayFor = "";
  private onClose?: () => void;
  private closed = false;
  protected lastPhase = "";
  /**
   * Scores to show instead of the real ones while a throw is still flying,
   * so the scoreboard doesn't spoil the result before the animation lands.
   */
  protected heldScores = new Map<string, number>();
  /** We only auto-close once the server has listed us as a player. */
  private seenInGame = false;
  private openedAt = 0;

  init(data: MinigameData) {
    this.seenInGame = false;
    this.openedAt = performance.now();
    this.onClose = data.onClose;
    this.closed = false;
    this.overlay = undefined;
    this.overlayFor = "";
    this.lastPhase = "";
  }

  create() {
    const { width, height } = this.scale;
    this.add.rectangle(0, 0, width, height, 0x120a08, 0.85).setOrigin(0).setInteractive();
    // The play area: as big as fits between the header (top 76px) and the
    // status/help lines (bottom ~70px), capped so it doesn't get huge.
    const w = Math.min(width - 32, 720), h = Math.max(150, Math.min(height - 150, 480));
    this.area = new Phaser.Geom.Rectangle((width - w) / 2, 76, w, h);
    this.add.rectangle(this.area.centerX, this.area.centerY, w + 8, h + 8, 0x2a1a14).setStrokeStyle(4, 0xe8762b);

    this.add.text(width / 2, 14, MINIGAMES[this.gameId].name, textStyle(26, P.goldLight)).setOrigin(0.5, 0);
    this.scoreText = this.add.text(width / 2, 48, "", textStyle(16)).setOrigin(0.5, 0);
    this.statusText = this.add.text(width / 2, this.area.bottom + 12, "", textStyle(18, P.goldLight)).setOrigin(0.5, 0);
    this.helpText = this.add.text(width / 2, this.area.bottom + 40, "", textStyle(13))
      .setOrigin(0.5, 0).setAlign("center").setWordWrapWidth(width - 32);
    this.add.text(width - 12, 14, "Esc: leave", textStyle(12)).setOrigin(1, 0).setAlpha(0.8);

    this.input.keyboard!.on("keydown-ESC", () => this.leave());
    this.events.once("shutdown", () => this.input.keyboard?.removeAllListeners());
    this.buildGame();
  }

  /** Draw the game's own things inside this.area. */
  protected abstract buildGame(): void;
  /** Called every frame while the phase is "playing". */
  protected abstract updateGame(time: number, delta: number): void;
  /** How a score is written ("7 pins", "3 apples", "42.1 m"). */
  protected abstract formatScore(score: number): string;
  /** Called when a new game starts (reset your visuals). */
  protected onGameStart(): void {}

  protected get mg() { return Network.room!.state.minigame; }
  protected get myId() { return Network.room!.sessionId; }
  protected player(id: string): PlayerState | undefined { return Network.room!.state.players.get(id); }
  protected nameOf(id: string) { return this.player(id)?.name ?? "?"; }
  protected colorOf(id: string) { return PLAYER_COLORS[this.player(id)?.color ?? 0].main; }

  update(time: number, delta: number) {
    if (this.closed) return;
    const mg = this.mg;
    // The game closed, or we're no longer in it. (Right after opening, give
    // the server a moment to add us before deciding that.)
    const inGame = mg.game === this.gameId && mg.players.includes(this.myId);
    if (inGame) this.seenInGame = true;
    if (!inGame && (this.seenInGame || performance.now() - this.openedAt > 2500)) return this.close();
    if (!inGame) return;

    this.scoreText.setText(mg.players.map((id) => `${this.nameOf(id)}: ${this.formatScore(this.heldScores.get(id) ?? mg.scores.get(id) ?? 0)}`).join("     "));

    if (mg.phase !== this.lastPhase) {
      if (mg.phase === "playing") { this.heldScores.clear(); this.onGameStart(); }
      this.lastPhase = mg.phase;
    }
    if (mg.phase === "lobby") this.showLobby();
    else if (mg.phase === "results") this.showResults();
    else {
      this.hideOverlay();
      this.updateGame(time, delta);
    }
  }

  // ------------------------------------------------------------------ overlays

  private button(x: number, y: number, label: string, onClick: () => void, color: string = P.orange) {
    return this.add.text(x, y, label, { ...textStyle(18, "#2a1a14"), strokeThickness: 0 })
      .setOrigin(0.5)
      .setPadding(14, 8, 14, 8).setBackgroundColor(color)
      .setInteractive({ useHandCursor: true }).on("pointerdown", onClick);
  }

  private showLobby() {
    const key = `lobby:${this.mg.players.join(",")}`;
    if (this.overlayFor === key) return;
    this.hideOverlay();
    this.overlayFor = key;
    const lines = this.mg.players.map((id) => `• ${this.nameOf(id)}`).join("\n");
    const waiting = this.mg.players.length < 2 ? "\n\nYour friend can join from this station.\nOr start now to practice solo." : "";
    const text = this.add.text(0, -40, `Players:\n${lines}${waiting}`, textStyle(17)).setOrigin(0.5).setAlign("center");
    const start = this.button(-70, 90, "Start!", () => Network.room!.send("mg:start"));
    const leave = this.button(70, 90, "Leave", () => this.leave(), P.woodLight);
    this.showOverlay([text, start, leave]);
    this.statusText.setText("");
    this.helpText.setText(this.instructions());
  }

  private showResults() {
    const key = `results:${this.mg.winner}`;
    if (this.overlayFor === key) return;
    this.hideOverlay();
    this.overlayFor = key;
    const mg = this.mg;
    const winner = mg.winner === "tie" ? "It's a tie!" : `${this.nameOf(mg.winner)} wins!`;
    const rows = [...mg.players]
      .sort((a, b) => (mg.scores.get(b) ?? 0) - (mg.scores.get(a) ?? 0))
      .map((id) => `${id === mg.winner ? "🏆 " : ""}${this.nameOf(id)} — ${this.formatScore(mg.scores.get(id) ?? 0)}`)
      .join("\n");
    const title = this.add.text(0, -70, winner, textStyle(30, P.goldLight)).setOrigin(0.5);
    const list = this.add.text(0, -10, rows, textStyle(20)).setOrigin(0.5).setAlign("center");
    const again = this.button(-80, 80, "Play again", () => Network.room!.send("mg:start"));
    const leave = this.button(80, 80, "Leave", () => this.leave(), P.woodLight);
    this.showOverlay([title, list, again, leave]);
    this.statusText.setText(mg.players.length > 1 ? "🎟 Tickets for playing — and extra for the winner!" : "");
  }

  private showOverlay(children: Phaser.GameObjects.GameObject[]) {
    const bg = this.add.rectangle(0, 0, Math.min(this.scale.width - 24, 440), 260, 0x2a1a14, 0.95).setStrokeStyle(3, 0xf4d77a);
    this.overlay = this.add.container(this.scale.width / 2, this.scale.height / 2, [bg, ...children]).setDepth(100);
    // Shrink the whole panel on very small screens so the buttons stay on screen.
    const fit = Math.min(1, (this.scale.height - 20) / 260);
    this.overlay.setData("fit", fit);
    this.overlay.setScale(0.8 * fit).setAlpha(0);
    this.tweens.add({ targets: this.overlay, scale: fit, alpha: 1, duration: 200, ease: "Back.easeOut" });
  }

  private hideOverlay() {
    this.overlay?.destroy();
    this.overlay = undefined;
    this.overlayFor = "";
  }

  /** Short how-to-play line shown in the lobby. */
  protected abstract instructions(): string;

  protected leave() {
    Network.room?.send("mg:leave");
    this.close();
  }

  private close() {
    if (this.closed) return;
    this.closed = true;
    this.onClose?.();
    this.scene.stop();
  }
}
