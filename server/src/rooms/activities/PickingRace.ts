import type { Client } from "colyseus";
import type { Delayed } from "colyseus";
import type { PatchRoom } from "../PatchRoom.js";
import { PumpkinState } from "../schema/ActivityState.js";
import { PATCH_MAP } from "../../../../shared/map/patchMap.js";
import { RACE, TICKETS } from "../../../../shared/constants.js";
import type { PickMessage } from "../../../../shared/messages.js";

/** How close (in tiles) you must be to pick a pumpkin or use your basket. */
const REACH = 1.6;

/** Every tilled-soil tile in the field: where pumpkins may grow. */
const SOIL_TILES: { x: number; y: number }[] = [];
PATCH_MAP.rows.forEach((row, y) => {
  for (let x = 0; x < row.length; x++) if (row[x] === ":") SOIL_TILES.push({ x, y });
});

const FIELD_SIGN = PATCH_MAP.props.find((p) => p.id === "signField")!;
const isPumpkin = (carrying: string) => carrying === "small" || carrying === "big";
const basketOf = (slot: number) => PATCH_MAP.props.find((p) => p.id === `basket${slot}`)!;

/**
 * PUMPKIN PICKING RACE (competitive, server-authoritative)
 *
 *  idle ──(someone uses the field sign)──▶ countdown 3s ──▶ running 60s ──▶ results 8s ──▶ idle
 *
 * While running: walk to a pumpkin, press E to pick it up (it disappears for
 * both players), carry it to YOUR basket and press E to score.
 * Small = 1 point, big = 3 points (but you walk slower carrying it).
 * When the race ends, every pumpkin regrows in a new spot.
 */
export class PickingRace {
  private timer?: Delayed;

  constructor(private room: PatchRoom) {
    this.regrow();
    room.onMessage("race:start", (client: Client) => this.start(client));
    room.onMessage("race:pick", (client: Client, msg: PickMessage) => this.pick(client, msg));
    room.onMessage("race:deliver", (client: Client) => this.deliver(client));
  }

  private get race() { return this.room.state.race; }

  private start(client: Client) {
    if (this.race.phase !== "idle") return;
    const player = this.room.state.players.get(client.sessionId);
    if (!player || this.room.isBusy(player)) return;
    // Must be standing at the field sign.
    if (this.room.tileDistance(player, FIELD_SIGN.x, FIELD_SIGN.y) > REACH) return;

    for (const p of this.room.state.players.values()) { p.raceScore = 0; if (isPumpkin(p.carrying)) p.carrying = ""; }
    this.race.winner = "";
    this.setPhase("countdown", RACE.countdownSeconds);
  }

  /** Switch phase and tick `secondsLeft` down once per second. */
  private setPhase(phase: string, seconds: number) {
    this.race.phase = phase;
    this.race.secondsLeft = seconds;
    this.timer?.clear();
    if (phase === "idle") return;
    this.timer = this.room.clock.setInterval(() => {
      this.race.secondsLeft = Math.max(0, this.race.secondsLeft - 1);
      if (this.race.secondsLeft > 0) return;
      if (phase === "countdown") this.setPhase("running", RACE.durationSeconds);
      else if (phase === "running") this.finish();
      else if (phase === "results") this.setPhase("idle", 0);
    }, 1000);
  }

  private finish() {
    // Pumpkins still being carried are lost when the whistle blows.
    for (const p of this.room.state.players.values()) if (isPumpkin(p.carrying)) p.carrying = "";

    const players = [...this.room.state.players.entries()];
    const best = Math.max(0, ...players.map(([, p]) => p.raceScore));
    const leaders = players.filter(([, p]) => p.raceScore === best);
    this.race.winner = leaders.length === 1 ? leaders[0][0] : "tie";
    if (players.length > 1) {
      this.room.awardTickets(players.map(([id]) => id), TICKETS.played);
      if (leaders.length === 1) this.room.awardTickets([leaders[0][0]], TICKETS.raceWin);
    }

    this.regrow();
    this.setPhase("results", RACE.resultsSeconds);
  }

  private pick(client: Client, msg: PickMessage) {
    if (this.race.phase !== "running") return;
    const player = this.room.state.players.get(client.sessionId);
    const pumpkin = this.room.state.pumpkins.get(String(msg?.id));
    if (!player || !pumpkin || pumpkin.picked || player.carrying) return;
    if (this.room.tileDistance(player, pumpkin.tx, pumpkin.ty) > REACH) return;

    pumpkin.picked = true; // hidden for both players right away
    player.carrying = pumpkin.big ? "big" : "small";
  }

  private deliver(client: Client) {
    if (this.race.phase !== "running") return;
    const player = this.room.state.players.get(client.sessionId);
    if (!player || !isPumpkin(player.carrying)) return;
    const basket = basketOf(player.slot);
    if (this.room.tileDistance(player, basket.x, basket.y) > REACH) return;

    player.raceScore += player.carrying === "big" ? RACE.bigPoints : RACE.smallPoints;
    player.carrying = "";
  }

  /** Clears the field and grows a fresh batch of pumpkins in random spots. */
  private regrow() {
    this.room.state.pumpkins.clear();
    const spots = [...SOIL_TILES].sort(() => Math.random() - 0.5);
    const total = RACE.smallPumpkins + RACE.bigPumpkins;
    for (let i = 0; i < total && i < spots.length; i++) {
      const id = `p${Date.now().toString(36)}_${i}`;
      this.room.state.pumpkins.set(id, new PumpkinState({
        id, tx: spots[i].x, ty: spots[i].y, big: i < RACE.bigPumpkins, picked: false,
      }));
    }
  }

  onPlayerLeave(_sessionId: string) {
    // If nobody's left to race, stop the race.
    if (this.room.state.players.size <= 1 && this.race.phase !== "idle") {
      this.timer?.clear();
      this.race.phase = "idle";
      this.regrow();
    }
  }
}
