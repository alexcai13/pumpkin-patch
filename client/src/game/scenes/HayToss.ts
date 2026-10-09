import * as Phaser from "phaser";
import { MINIGAMES } from "../../../../shared/constants";
import { TOSS, tossPosition, tossFlightTime, type TossThrow } from "../../../../shared/minigames";
import { Network } from "../net/Network";
import { MinigameScene, textStyle } from "./MinigameScene";
import { P } from "../art/palette";

interface ThrowMessage { by: string; game: string; input: TossThrow; result: { meters: number }; round: number }

/** Furthest distance the field shows (meters). */
const FIELD_METERS = 100;

/**
 * HAY BALE TOSS
 * Your turn: Space to lock the swinging ANGLE, then Space to stop the POWER
 * bar. The bale flies (shared/minigames.ts tossDistance — 45° goes furthest).
 * 3 throws each; your longest throw counts.
 */
export class HayToss extends MinigameScene {
  protected readonly gameId = "toss" as const;
  private groundY = 0;
  private originX = 0;
  private pxPerMeter = 1;
  private bale!: Phaser.GameObjects.Image;
  private needle!: Phaser.GameObjects.Graphics;
  private powerBar!: Phaser.GameObjects.Graphics;
  private marks!: Phaser.GameObjects.Graphics;
  private callout!: Phaser.GameObjects.Text;
  private mode: "idle" | "angle" | "power" | "wait" = "idle";
  private angle = 45;
  private power = 0;
  private t = 0;
  private animating = false;
  private unbind?: () => void;

  constructor() { super("HayToss"); }

  protected instructions() {
    return `Space to lock the angle, Space again to stop the power bar. ${MINIGAMES.toss.turns} throws each — longest throw wins!`;
  }
  protected formatScore(cm: number) { return `${(cm / 100).toFixed(1)} m`; }

  protected buildGame() {
    const a = this.area;
    this.groundY = a.bottom - 40;
    this.originX = a.x + 60;
    this.pxPerMeter = (a.width - 100) / FIELD_METERS;
    const g = this.add.graphics();
    // Dusky sky, a field, distance markers every 10 m.
    g.fillGradientStyle(0x4a3045, 0x4a3045, 0xe8a05a, 0xe8a05a, 1).fillRect(a.x, a.y, a.width, this.groundY - a.y);
    g.fillStyle(0x6b8f3a).fillRect(a.x, this.groundY, a.width, a.bottom - this.groundY);
    g.fillStyle(0x557530).fillRect(a.x, this.groundY, a.width, 3);
    for (let m = 10; m <= FIELD_METERS; m += 10) {
      const x = this.originX + m * this.pxPerMeter;
      g.fillStyle(0xf1e3c2).fillRect(x - 1, this.groundY, 2, 10);
      this.add.text(x, this.groundY + 12, `${m}`, textStyle(11)).setOrigin(0.5, 0);
    }
    // The thrower (a farmer silhouette) and their pile of bales
    g.fillStyle(0x2a1a14).fillRect(this.originX - 34, this.groundY - 30, 10, 30).fillCircle(this.originX - 29, this.groundY - 36, 7);
    for (let i = 0; i < 3; i++) this.add.image(this.originX - 50, this.groundY - 6 - i * 13, "hay").setScale(0.9).setOrigin(0.5, 1);

    this.marks = this.add.graphics();
    this.bale = this.add.image(this.originX, this.groundY - 8, "hay").setScale(1.3);
    this.needle = this.add.graphics();
    this.powerBar = this.add.graphics();
    this.callout = this.add.text(a.centerX, a.y + 50, "", textStyle(36, P.goldLight)).setOrigin(0.5).setDepth(50);

    this.input.keyboard!.on("keydown-SPACE", () => this.press());
    this.unbind = Network.room!.onMessage("mg:throw", (msg: ThrowMessage) => { if (msg.game === "toss") this.playThrow(msg); });
    this.events.once("shutdown", () => this.unbind?.());
  }

  protected onGameStart() {
    this.mode = "idle";
    this.animating = false;
    this.marks.clear();
    this.bale.setPosition(this.originX, this.groundY - 8).setAngle(0);
  }

  private press() {
    if (this.mg.phase !== "playing" || this.mg.turn !== this.myId) return;
    if (this.mode === "angle") { this.mode = "power"; this.t = 0; }
    else if (this.mode === "power") {
      this.mode = "wait";
      Network.room!.send("mg:throw", { angle: this.angle, power: this.power });
    }
  }

  protected updateGame(_time: number, delta: number) {
    const myTurn = this.mg.turn === this.myId;
    if (myTurn && this.mode === "idle" && !this.animating) {
      this.mode = "angle"; this.t = 0;
      this.bale.setPosition(this.originX, this.groundY - 8).setAngle(0);
    }
    if (!myTurn && (this.mode === "angle" || this.mode === "power")) this.mode = "idle";

    this.t += delta;
    if (this.mode === "angle") {
      // Swings between the lowest and highest angle.
      const f = 1 - Math.abs(((this.t / 1600) % 2) - 1);
      this.angle = TOSS.minAngle + f * (TOSS.maxAngle - TOSS.minAngle);
    }
    if (this.mode === "power") this.power = 1 - Math.abs(((this.t / 1000) % 2) - 1);

    this.needle.clear();
    if (this.mode === "angle" || this.mode === "power") {
      const rad = Phaser.Math.DegToRad(this.angle);
      this.needle.lineStyle(3, 0xf4d77a).lineBetween(this.originX, this.groundY - 8, this.originX + Math.cos(rad) * 70, this.groundY - 8 - Math.sin(rad) * 70);
    }
    this.powerBar.clear();
    if (this.mode === "power") {
      const x = this.area.x + 16, h = this.area.height * 0.5, y = this.groundY - 10;
      this.powerBar.fillStyle(0x2a1a14).fillRect(x - 2, y - h - 2, 20, h + 4);
      this.powerBar.fillStyle(this.power > 0.8 ? 0xc23b3b : this.power > 0.5 ? 0xe3b341 : 0x5e8c3a).fillRect(x, y - h * this.power, 16, h * this.power);
    }

    this.statusText.setText(
      !this.mg.turn ? "" :
      myTurn ? (this.mode === "angle" ? `Angle ${Math.round(this.angle)}° — Space to lock` : this.mode === "power" ? "Space to stop the power bar!" : "Throwing…") :
      `${this.nameOf(this.mg.turn)}'s throw (${this.mg.round}/${MINIGAMES.toss.turns})…`,
    );
  }

  /** Fly the bale along the exact arc the server measured. */
  private playThrow(msg: ThrowMessage) {
    this.animating = true;
    this.mode = "idle";
    // Keep the old best on the scoreboard until the bale lands.
    this.heldScores.set(msg.by, this.mg.scores.get(msg.by) ?? 0);
    this.needle.clear();
    this.powerBar.clear();
    const flight = tossFlightTime(msg.input);
    const realMs = Math.min(2600, Math.max(900, flight * 600)); // sped up so it's snappy
    const state = { t: 0 };
    this.tweens.add({
      targets: state, t: 1, duration: realMs, ease: "Linear",
      onUpdate: () => {
        const p = tossPosition(msg.input, state.t * flight);
        this.bale.setPosition(this.originX + p.x * this.pxPerMeter, this.groundY - 8 - Math.max(0, p.y) * this.pxPerMeter);
        this.bale.setAngle(state.t * 540);
      },
      onComplete: () => {
        // Leave a little flag where it landed, in the thrower's color.
        const x = this.originX + Math.min(FIELD_METERS, msg.result.meters) * this.pxPerMeter;
        const color = Phaser.Display.Color.HexStringToColor(this.colorOf(msg.by)).color;
        this.marks.fillStyle(0x2a1a14).fillRect(x - 1, this.groundY - 22, 2, 22);
        this.marks.fillStyle(color).fillTriangle(x + 1, this.groundY - 22, x + 12, this.groundY - 18, x + 1, this.groundY - 14);
        this.bale.setAngle(0);
        this.heldScores.delete(msg.by);
        const who = msg.by === this.myId ? "You" : this.nameOf(msg.by);
        this.callout.setText(`${who}: ${msg.result.meters.toFixed(1)} m!`).setScale(1.4).setAlpha(1);
        this.tweens.add({ targets: this.callout, scale: 1, duration: 250, ease: "Back.easeOut" });
        this.tweens.add({ targets: this.callout, alpha: 0, delay: 1200, duration: 300 });
        this.time.delayedCall(800, () => { this.animating = false; });
      },
    });
  }
}
