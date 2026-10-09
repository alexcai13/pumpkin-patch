import { Scene, GameObjects } from "phaser";
import { PLAYER_COLORS } from "../../../../shared/constants";
import { Network } from "../net/Network";
import { FONT } from "../ui/fonts";
import { Sound } from "../audio/Sound";

/**
 * PUMPKIN PICKING RACE — screen UI.
 * Launched by RaceView when a race starts; reads everything straight from the
 * synced state each frame, and closes itself when the race goes back to idle.
 *  - countdown: big "3, 2, 1, GO!"
 *  - running:   timer + live scores
 *  - results:   scoreboard + winner
 */
export class RaceHud extends Scene {
  private timer!: GameObjects.Text;
  private scores!: GameObjects.Text;
  private big!: GameObjects.Text;
  private panel?: GameObjects.Container;
  private lastPhase = "";
  private lastBig = "";

  constructor() {
    super("RaceHud");
  }

  create() {
    const { width } = this.scale;
    this.timer = this.add.text(width / 2, 52, "", style(28, "#ffe08a")).setOrigin(0.5, 0);
    this.scores = this.add.text(width - 14, 12, "", style(16, "#fff4d6")).setOrigin(1, 0).setAlign("right");
    this.big = this.add.text(width / 2, this.scale.height / 2 - 40, "", style(72, "#ffe08a")).setOrigin(0.5);
    this.lastPhase = "";
    this.lastBig = "";
    this.panel = undefined; // (a scene object survives restarts; clear the old reference)
    this.scale.on("resize", this.layout, this);
    this.events.once("shutdown", () => this.scale.off("resize", this.layout, this));
  }

  private layout() {
    const { width, height } = this.scale;
    this.timer.setX(width / 2);
    this.scores.setX(width - 14);
    this.big.setPosition(width / 2, height / 2 - 40);
    this.panel?.setPosition(width / 2, height / 2);
  }

  update() {
    const room = Network.room;
    if (!room) return;
    const race = room.state.race;
    const players = [...room.state.players.entries()];

    if (race.phase === "idle") {
      this.scene.stop();
      return;
    }

    // Big center text: "3", "2", "1", then a quick "GO!".
    if (race.phase === "countdown" && String(race.secondsLeft) !== this.lastBig) {
      this.flashBig(String(race.secondsLeft), false);
    }
    if (race.phase === "running" && this.lastPhase === "countdown") this.flashBig("GO!", true);

    if (race.phase === "running") {
      const s = race.secondsLeft;
      this.timer.setText(`🎃 ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
      this.timer.setColor(s <= 10 ? "#ff9a7a" : "#ffe08a");
    } else {
      this.timer.setText(race.phase === "countdown" ? "Pumpkin race! Bring pumpkins to YOUR basket" : "");
      this.timer.setFontSize(race.phase === "countdown" ? 18 : 28);
    }
    if (race.phase === "running") this.timer.setFontSize(28);

    this.scores.setText(players
      .sort(([, a], [, b]) => a.slot - b.slot)
      .map(([, p]) => `${p.name}: ${p.raceScore}`)
      .join("\n"));

    if (race.phase === "results" && this.lastPhase !== "results") this.showResults();
    if (race.phase !== "results" && this.panel) { this.panel.destroy(); this.panel = undefined; }
    this.lastPhase = race.phase;
  }

  private flashBig(text: string, fadeOut: boolean) {
    this.lastBig = text;
    Sound.play(fadeOut ? "go" : "beep");
    this.tweens.killTweensOf(this.big);
    this.big.setText(text).setScale(1.6).setAlpha(1);
    this.tweens.add({ targets: this.big, scale: 1, duration: 300, ease: "Back.easeOut" });
    if (fadeOut) this.tweens.add({ targets: this.big, alpha: 0, delay: 700, duration: 300 });
  }

  private showResults() {
    Sound.play("win");
    const room = Network.room!;
    const race = room.state.race;
    const players = [...room.state.players.entries()].sort(([, a], [, b]) => b.raceScore - a.raceScore);
    const winner = room.state.players.get(race.winner);
    const title = race.winner === "tie" ? "It's a tie!" : winner ? `${winner.name} wins!` : "Time's up!";

    const rows = players.map(([id, p], i) => {
      const t = this.add.text(0, -10 + i * 30, `${p.name}   ${p.raceScore} pts`, style(20, id === race.winner ? "#ffe08a" : "#f1e3c2")).setOrigin(0.5);
      const dot = this.add.rectangle(-t.width / 2 - 16, t.y, 12, 12, Number.parseInt(PLAYER_COLORS[p.color].main.slice(1), 16)).setStrokeStyle(2, 0x2a1a14);
      return [dot, t];
    }).flat();
    const bg = this.add.rectangle(0, 0, 360, 110 + players.length * 30, 0x2a1a14, 0.92).setStrokeStyle(4, 0xe8762b);
    const heading = this.add.text(0, -40 - (players.length - 1) * 8, "🏆 " + title, style(26, "#ffe08a")).setOrigin(0.5);
    const foot = this.add.text(0, 30 + players.length * 22, "Pumpkins regrew — race again at the field sign!", style(12, "#f1e3c2")).setOrigin(0.5);
    this.panel = this.add.container(this.scale.width / 2, this.scale.height / 2, [bg, heading, ...rows, foot]);
    this.panel.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: this.panel, scale: 1, alpha: 1, duration: 300, ease: "Back.easeOut" });
  }
}

function style(size: number, color: string) {
  return { fontFamily: FONT, fontSize: `${size}px`, color, stroke: "#2a1a14", strokeThickness: 5 };
}
