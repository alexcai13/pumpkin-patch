import type { Client } from "colyseus";
import type { PatchRoom } from "../PatchRoom.js";
import { MinigameState } from "../schema/ActivityState.js";
import { PATCH_MAP } from "../../../../shared/map/patchMap.js";
import { MINIGAMES, TICKETS, type MinigameId } from "../../../../shared/constants.js";
import {
  rollBowling, tossDistance, appleInTarget, mixSeed, APPLES,
  type BowlingThrow, type TossThrow,
} from "../../../../shared/minigames.js";

const STATIONS = PATCH_MAP.stations!;
/** How long clients get to animate a throw before the next turn (ms). */
const THROW_ANIMATION_MS = 3200;
const isGame = (g: string): g is MinigameId => g in MINIGAMES;

/**
 * MINIGAMES: Pumpkin Bowling, Apple Bobbing, Hay Bale Toss (competitive).
 *
 * One minigame at a time per room. Flow:
 *   E at a station → "lobby" (the other player can join from the station)
 *   → Start → "playing" → "results" (scoreboard + winner) → Play again / Leave
 *
 * The server owns all scores. For bowling and toss, the thrower's client
 * sends only their inputs (aim/angle + power); the server runs the shared
 * physics in shared/minigames.ts and broadcasts the outcome, which both
 * clients animate with the same functions.
 */
export class Minigames {
  /** Ignore throws until the last one has finished animating. */
  private busyUntil = 0;
  /** Apples: when each player's "dunked" penalty ends (ms). */
  private penaltyUntil = new Map<string, number>();
  private finishTimer?: { clear(): void };

  constructor(private room: PatchRoom) {
    room.state.minigame = new MinigameState();
    room.onMessage("mg:open", (client: Client, msg: { game: string }) => this.open(client, String(msg?.game)));
    room.onMessage("mg:join", (client: Client) => this.join(client));
    room.onMessage("mg:start", (client: Client) => this.start(client));
    room.onMessage("mg:leave", (client: Client) => this.leave(client.sessionId));
    room.onMessage("mg:throw", (client: Client, msg: BowlingThrow & TossThrow) => this.throw(client, msg));
    room.onMessage("apples:bite", (client: Client) => this.bite(client));
  }

  private get mg() { return this.room.state.minigame; }

  isPlaying(sessionId: string) {
    return this.mg.game !== "" && this.mg.players.includes(sessionId);
  }

  private atStation(sessionId: string, game: MinigameId) {
    const p = this.room.state.players.get(sessionId);
    if (!p) return false;
    const r = STATIONS[game];
    const cx = (r.x + r.w / 2) * 16, cy = (r.y + r.h / 2) * 16;
    return Math.hypot(p.x - cx, p.y - cy) / 16 <= Math.max(r.w, r.h) / 2 + 2;
  }

  private open(client: Client, game: string) {
    const p = this.room.state.players.get(client.sessionId);
    if (!p || !isGame(game) || this.mg.game !== "" || this.room.isBusy(p)) return;
    if (!this.atStation(client.sessionId, game)) return;
    this.mg.game = game;
    this.mg.phase = "lobby";
    this.mg.players.clear();
    this.mg.players.push(client.sessionId);
    this.mg.scores.clear();
    this.mg.winner = "";
    this.room.broadcast("toast", { text: `${p.name} wants to play ${MINIGAMES[game].name} — come join!` }, { except: client });
  }

  private join(client: Client) {
    const game = this.mg.game;
    if (!isGame(game) || this.mg.players.includes(client.sessionId) || this.mg.players.length >= 2) return;
    if (this.mg.phase === "playing" || !this.atStation(client.sessionId, game)) return;
    this.mg.players.push(client.sessionId);
  }

  private start(client: Client) {
    const game = this.mg.game;
    if (!isGame(game) || !this.mg.players.includes(client.sessionId) || this.mg.phase === "playing") return;
    this.mg.scores.clear();
    this.mg.generations.clear();
    for (const id of this.mg.players) {
      this.mg.scores.set(id, 0);
      this.mg.generations.set(id, Array(APPLES.perBarrel).fill(0).join(","));
    }
    this.penaltyUntil.clear();
    this.mg.winner = "";
    this.mg.round = 1;
    this.mg.turn = this.mg.players[0];
    this.mg.seed = (Math.random() * 2 ** 31) >>> 0;
    this.mg.startedAt = Date.now() + 3000; // 3-second countdown before apples start moving
    this.busyUntil = 0;
    this.mg.phase = "playing";
    // Apples needs both clocks to agree: tell clients what time it is here.
    for (const id of this.mg.players) this.room.clientOf(id)?.send("mg:clock", { now: Date.now() });
  }

  private throw(client: Client, msg: BowlingThrow & TossThrow) {
    const game = this.mg.game;
    if ((game !== "bowling" && game !== "toss") || this.mg.phase !== "playing") return;
    if (this.mg.turn !== client.sessionId || Date.now() < this.busyUntil || !msg) return;

    let result: unknown;
    let input: BowlingThrow | TossThrow;
    if (game === "bowling") {
      input = { aim: Number(msg.aim) || 0, power: Number(msg.power) || 0 };
      const seed = mixSeed(this.mg.seed, this.mg.round, this.mg.players.indexOf(client.sessionId));
      const r = rollBowling(input, seed);
      result = { ...r, seed };
      this.mg.scores.set(client.sessionId, (this.mg.scores.get(client.sessionId) ?? 0) + r.knocked.length);
    } else {
      input = { angle: Number(msg.angle) || 45, power: Number(msg.power) || 0 };
      const meters = tossDistance(input);
      result = { meters };
      const best = this.mg.scores.get(client.sessionId) ?? 0;
      // Scores are whole centimeters (schema numbers are fine, ints read nicer).
      this.mg.scores.set(client.sessionId, Math.max(best, Math.round(meters * 100)));
    }
    this.room.broadcast("mg:throw", { by: client.sessionId, game, input, result, round: this.mg.round });
    this.busyUntil = Date.now() + THROW_ANIMATION_MS;

    // Next turn: alternate players; after everyone has gone, next round.
    const i = this.mg.players.indexOf(client.sessionId);
    const last = i === this.mg.players.length - 1;
    const turns = MINIGAMES[game].turns;
    if (last && this.mg.round >= turns) {
      this.finishTimer = this.room.clock.setTimeout(() => this.finish(), THROW_ANIMATION_MS);
      this.mg.turn = "";
      return;
    }
    // Nobody's turn while the throw animates; then the next player goes.
    this.mg.turn = "";
    this.room.clock.setTimeout(() => {
      if (this.mg.phase !== "playing") return;
      if (last) this.mg.round++;
      this.mg.turn = this.mg.players[last ? 0 : i + 1];
    }, THROW_ANIMATION_MS);
  }

  private bite(client: Client) {
    if (this.mg.game !== "apples" || this.mg.phase !== "playing") return;
    const id = client.sessionId;
    const playerIndex = this.mg.players.indexOf(id);
    if (playerIndex === -1) return;
    const now = Date.now();
    if (now < (this.penaltyUntil.get(id) ?? 0) || now < this.mg.startedAt) return;

    // Was an apple in your mouth just now? Allow for network delay by
    // checking the last 250 ms.
    const gens = (this.mg.generations.get(id) ?? "0,0,0").split(",").map(Number);
    const elapsed = now - this.mg.startedAt;
    let slot = -1;
    for (let ms = elapsed; ms >= elapsed - 250 && slot === -1; ms -= 10) {
      slot = appleInTarget(this.mg.seed, playerIndex, gens, ms);
    }
    if (slot === -1) {
      this.penaltyUntil.set(id, now + APPLES.missPenaltyMs);
      this.room.broadcast("apples:bite", { by: id, hit: false });
      return;
    }
    gens[slot]++;
    this.mg.generations.set(id, gens.join(","));
    const score = (this.mg.scores.get(id) ?? 0) + 1;
    this.mg.scores.set(id, score);
    this.room.broadcast("apples:bite", { by: id, hit: true, slot });
    if (score >= MINIGAMES.apples.target) this.finish();
  }

  private finish() {
    if (this.mg.phase !== "playing") return;
    this.mg.phase = "results";
    this.mg.turn = "";
    const entries = [...this.mg.scores.entries()];
    const best = Math.max(...entries.map(([, s]) => s));
    const leaders = entries.filter(([, s]) => s === best);
    this.mg.winner = leaders.length === 1 ? leaders[0][0] : "tie";
    const ids = [...this.mg.players];
    if (ids.length > 1) {
      this.room.awardTickets(ids, TICKETS.played);
      if (leaders.length === 1) this.room.awardTickets([leaders[0][0]], TICKETS.minigameWin);
    }
  }

  leave(sessionId: string) {
    const i = this.mg.players.indexOf(sessionId);
    if (i === -1) return;
    this.mg.players.splice(i, 1);
    if (this.mg.players.length === 0) {
      this.finishTimer?.clear();
      this.mg.game = "";
      this.mg.phase = "";
      this.mg.scores.clear();
      this.mg.turn = "";
      return;
    }
    // Someone quit mid-game: end it with the scores so far.
    if (this.mg.phase === "playing") {
      this.mg.scores.delete(sessionId);
      this.finish();
    }
  }
}
