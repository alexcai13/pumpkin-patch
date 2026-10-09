import * as Phaser from "phaser";
import { MINIGAMES } from "../../../../shared/constants";
import { LANE, PINS, MAX_AIM, type BowlingResult, type BowlingThrow } from "../../../../shared/minigames";
import { Network } from "../net/Network";
import { MinigameScene, textStyle } from "./MinigameScene";
import { P } from "../art/palette";
import { Sound } from "../audio/Sound";

interface ThrowMessage { by: string; game: string; input: BowlingThrow; result: BowlingResult & { seed: number }; round: number }

/**
 * PUMPKIN BOWLING
 * Your turn: ← → to aim, Space to lock it, then Space again to stop the
 * power bar. A pumpkin rolls at 10 hay-bale pins. 3 rolls each; most pins wins.
 * The server decides what got knocked down (shared/minigames.ts rollBowling)
 * and both screens play the same roll.
 */
export class Bowling extends MinigameScene {
  protected readonly gameId = "bowling" as const;
  private k = 1;           // lane units → screen px
  private laneX = 0;       // screen x of the lane's left edge
  private laneY = 0;       // screen y of the lane's far end
  private pins: Phaser.GameObjects.Image[] = [];
  private ball!: Phaser.GameObjects.Image;
  private aimLine!: Phaser.GameObjects.Graphics;
  private powerBar!: Phaser.GameObjects.Graphics;
  private callout!: Phaser.GameObjects.Text;
  private mode: "idle" | "aim" | "power" | "wait" = "idle";
  private aim = 0;
  private power = 0;
  private powerTime = 0;
  private animating = false;
  private keys!: { left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key };
  private unbind?: () => void;

  constructor() { super("Bowling"); }

  protected instructions() {
    return `← → aim, Space to lock, Space again to stop the power bar. ${MINIGAMES.bowling.turns} rolls each — most pins wins!`;
  }
  protected formatScore(s: number) { return `${s} pins`; }

  /** Lane coordinates → screen. */
  private sx(x: number) { return this.laneX + x * this.k; }
  private sy(y: number) { return this.laneY + y * this.k; }

  protected buildGame() {
    const a = this.area;
    this.k = (a.height - 30) / LANE.length;
    this.laneX = a.centerX - (LANE.width * this.k) / 2;
    this.laneY = a.y + 15;
    const g = this.add.graphics();
    // Gutters, then the polished wooden lane with board lines.
    g.fillStyle(0x3b2618).fillRect(this.laneX - 10 * this.k, this.laneY, (LANE.width + 20) * this.k, LANE.length * this.k);
    g.fillStyle(0xd1a265).fillRect(this.laneX, this.laneY, LANE.width * this.k, LANE.length * this.k);
    g.lineStyle(1, 0xa87a45, 0.6);
    for (let x = 10; x < LANE.width; x += 10) g.lineBetween(this.sx(x), this.laneY, this.sx(x), this.sy(LANE.length));
    // Aiming arrows painted on the lane
    g.fillStyle(0x8f6440);
    for (const x of [30, 40, 50, 60, 70]) g.fillTriangle(this.sx(x), this.sy(250), this.sx(x) - 3, this.sy(258), this.sx(x) + 3, this.sy(258));
    g.lineStyle(2, 0x6e4529).lineBetween(this.laneX, this.sy(360), this.sx(LANE.width), this.sy(360)); // foul line

    this.pins = PINS.map((p) => this.add.image(this.sx(p.x), this.sy(p.y), "bowling_pin").setScale(this.k * 1.3).setOrigin(0.5, 0.8));
    this.ball = this.add.image(this.sx(50), this.sy(390), "bowling_ball").setScale(this.k * 1.3);
    this.aimLine = this.add.graphics();
    this.powerBar = this.add.graphics();
    this.callout = this.add.text(a.centerX, a.y + a.height * 0.45, "", textStyle(40, P.goldLight)).setOrigin(0.5).setDepth(50);

    const kb = this.input.keyboard!;
    this.keys = { left: kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT), right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT) };
    kb.on("keydown-SPACE", () => this.press());
    this.unbind = Network.room!.onMessage("mg:throw", (msg: ThrowMessage) => { if (msg.game === "bowling") this.playThrow(msg); });
    this.events.once("shutdown", () => this.unbind?.());
  }

  protected onGameStart() {
    this.mode = "idle";
    this.animating = false;
    this.resetPins();
  }

  private resetPins() {
    PINS.forEach((p, i) => this.pins[i].setPosition(this.sx(p.x), this.sy(p.y)).setAngle(0).setAlpha(1));
    this.ball.setPosition(this.sx(50), this.sy(390)).setAlpha(1).setAngle(0);
  }

  private press() {
    if (this.mg.phase !== "playing" || this.mg.turn !== this.myId) return;
    if (this.mode === "aim") { this.mode = "power"; this.powerTime = 0; }
    else if (this.mode === "power") {
      this.mode = "wait";
      Network.room!.send("mg:throw", { aim: this.aim, power: this.power });
    }
  }

  protected updateGame(_time: number, delta: number) {
    const myTurn = this.mg.turn === this.myId;
    if (myTurn && this.mode === "idle" && !this.animating) { this.mode = "aim"; this.aim = 0; this.resetPins(); }
    if (!myTurn && this.mode !== "idle" && this.mode !== "wait") this.mode = "idle";

    // Aim with ← →
    if (this.mode === "aim") {
      const dir = (this.keys.right.isDown ? 1 : 0) - (this.keys.left.isDown ? 1 : 0);
      this.aim = Phaser.Math.Clamp(this.aim + dir * (delta / 1000) * 0.2, -MAX_AIM, MAX_AIM);
    }
    // Power bar swings back and forth until you stop it.
    if (this.mode === "power") {
      this.powerTime += delta;
      this.power = 1 - Math.abs(((this.powerTime / 1100) % 2) - 1);
    }

    this.aimLine.clear();
    if (this.mode === "aim" || this.mode === "power") {
      this.aimLine.lineStyle(2, 0xf4d77a, 0.9);
      const len = 150;
      this.aimLine.lineBetween(this.sx(50), this.sy(390), this.sx(50 + Math.sin(this.aim) * len), this.sy(390 - Math.cos(this.aim) * len));
    }
    this.powerBar.clear();
    if (this.mode === "power") {
      const x = this.laneX + LANE.width * this.k + 30, y = this.area.bottom - 20, h = this.area.height * 0.6;
      this.powerBar.fillStyle(0x2a1a14).fillRect(x - 2, y - h - 2, 20, h + 4);
      this.powerBar.fillStyle(this.power > 0.8 ? 0xc23b3b : this.power > 0.5 ? 0xe3b341 : 0x5e8c3a).fillRect(x, y - h * this.power, 16, h * this.power);
    }

    const turnName = this.mg.turn ? this.nameOf(this.mg.turn) : "";
    this.statusText.setText(
      !this.mg.turn ? "" :
      myTurn ? (this.mode === "aim" ? "Your roll! Aim with ← →, then Space" : this.mode === "power" ? "Space to stop the power bar!" : "Rolling…") :
      `${turnName}'s roll (${this.mg.round}/${MINIGAMES.bowling.turns})…`,
    );
  }

  /** Animate a roll exactly as the server computed it. */
  private playThrow(msg: ThrowMessage) {
    this.animating = true;
    this.mode = "idle";
    // Show the old score until the pins have fallen.
    this.heldScores.set(msg.by, this.mg.scores.get(msg.by) ?? 0);
    this.aimLine.clear();
    this.powerBar.clear();
    this.resetPins();
    const r = msg.result;
    const duration = 1100 + (1 - msg.input.power) * 700;
    Sound.play("roll");
    if (r.knocked.length) this.time.delayedCall(duration * 0.75, () => Sound.play("pins"));
    this.tweens.add({
      targets: this.ball, x: this.sx(r.endX), y: this.sy(r.endY), angle: 720, duration, ease: "Quad.easeOut",
      onComplete: () => { if (r.gutter) this.tweens.add({ targets: this.ball, alpha: 0, duration: 300 }); },
    });
    // Each knocked pin tumbles when the ball (or a neighbour) reaches it.
    const startY = 390, travel = Math.max(1, startY - r.endY);
    r.knocked.forEach((i, n) => {
      const pin = this.pins[i];
      const reach = Phaser.Math.Clamp((startY - PINS[i].y) / travel, 0, 1);
      this.tweens.add({
        targets: pin,
        angle: (PINS[i].x < 50 ? -1 : 1) * (80 + n * 7),
        x: pin.x + (PINS[i].x < 50 ? -1 : 1) * 12 * this.k,
        y: pin.y - 10 * this.k,
        alpha: 0.35,
        delay: duration * reach * 0.8 + n * 40,
        duration: 350,
        ease: "Quad.easeOut",
      });
    });
    this.time.delayedCall(duration + 400, () => {
      const n = r.knocked.length;
      const who = msg.by === this.myId ? "You" : this.nameOf(msg.by);
      this.heldScores.delete(msg.by);
      this.callout.setText(n === 10 ? "STRIKE! 🎃" : r.gutter && n === 0 ? "Gutter ball!" : `${who}: ${n} pin${n === 1 ? "" : "s"}`).setScale(1.5).setAlpha(1);
      this.tweens.add({ targets: this.callout, scale: 1, duration: 250, ease: "Back.easeOut" });
      this.tweens.add({ targets: this.callout, alpha: 0, delay: 1100, duration: 300 });
      this.time.delayedCall(1100, () => { this.animating = false; });
    });
  }
}
