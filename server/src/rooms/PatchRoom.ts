import { Room, Client, CloseCode, type Delayed } from "colyseus";
import { PatchState } from "./schema/PatchState.js";
import { PlayerState } from "./schema/PlayerState.js";
import { RaceState, HayrideState, BoothState } from "./schema/ActivityState.js";
import { claimRoomCode, releaseRoomCode } from "./roomCodes.js";
import { PATCH_MAP } from "../../../shared/map/patchMap.js";
import { CollisionGrid } from "../../../shared/map/collision.js";
import {
  TILE, MAX_PLAYERS, PLAYER_COLORS, NAME_MAX, RUN_STEP_MS, Dir,
} from "../../../shared/constants.js";
import type { JoinOptions, MoveMessage, CorrectMessage } from "../../../shared/messages.js";
import { Emotes } from "./activities/Emotes.js";
import { PickingRace } from "./activities/PickingRace.js";
import { Carving } from "./activities/Carving.js";
import { Benches } from "./activities/Benches.js";
import { Hayride } from "./activities/Hayride.js";
import { PhotoBooth } from "./activities/PhotoBooth.js";
import { GiantPumpkin } from "./activities/GiantPumpkin.js";
import { Scarecrow } from "./activities/Scarecrow.js";
import { CornMaze } from "./activities/CornMaze.js";
import { Minigames } from "./activities/Minigames.js";
import { PrizeStand } from "./activities/PrizeStand.js";
import { Farmer } from "./activities/Farmer.js";
import { Crow } from "./activities/Crow.js";

/** Fastest legal speed in px/sec (running), plus 25% slack for timing jitter. */
const MAX_SPEED = (TILE / (RUN_STEP_MS / 1000)) * 1.25;
/**
 * Movement "budget" cap in pixels. Each player earns budget over time at
 * MAX_SPEED and spends it by moving. The cap lets a burst of delayed messages
 * (after a network hiccup) through, while still catching teleports.
 */
const MAX_BUDGET = MAX_SPEED * 1.5;

/** Server-only bookkeeping per player (not synced to clients). */
interface MoveGuard {
  budget: number;
  lastTime: number;
}

export class PatchRoom extends Room<{ state: PatchState }> {
  maxClients = MAX_PLAYERS;
  state = new PatchState();

  /** Seconds the server holds a dropped player's seat before removing them. */
  static RECONNECT_SECONDS = 15;

  /**
   * How long an EMPTY room (and its code) stays alive. Without this, the room
   * vanished the instant its only player refreshed or closed the tab, and
   * the friend typing the code got "no patch found". Carvings etc. survive too.
   */
  static EMPTY_ROOM_SECONDS = 120;
  autoDispose = false;
  private emptyTimer?: Delayed;

  /**
   * Walkability for THIS room. Each room has its own copy because some things
   * (like the parked hayride wagon) block tiles only some of the time.
   */
  readonly collision = new CollisionGrid(PATCH_MAP);

  private guards = new Map<string, MoveGuard>();

  // Each activity lives in its own file under activities/ and registers its
  // own message handlers. They're created in onCreate.
  private race!: PickingRace;
  private hayride!: Hayride;
  private booth!: PhotoBooth;
  private scarecrow!: Scarecrow;
  private maze!: CornMaze;
  private minigames!: Minigames;
  private crow!: Crow;
  /** Public so other activities can report farmer-task progress. */
  farmer!: Farmer;

  messages = {
    /** A client reports where its own character is (≈15 times per second). */
    move: (client: Client, msg: MoveMessage) => {
      const player = this.state.players.get(client.sessionId);
      const guard = this.guards.get(client.sessionId);
      if (!player || !guard || !msg) return;
      if (!Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return;
      // Sitting, riding, posing, in the maze or a minigame: they're not
      // walking around the patch, so ignore reports.
      if (this.isBusy(player, client.sessionId)) return;

      // Refill the movement budget for the time that passed.
      const now = Date.now();
      guard.budget = Math.min(MAX_BUDGET, guard.budget + ((now - guard.lastTime) / 1000) * MAX_SPEED);
      guard.lastTime = now;

      const dist = Math.hypot(msg.x - player.x, msg.y - player.y);
      // Walking INTO a blocked tile is cheating, but walking OUT of one is fine
      // (e.g. the wagon parked on top of you).
      const intoWall = this.blockedAt(msg.x, msg.y) && !this.blockedAt(player.x, player.y);

      if (dist > guard.budget || intoWall) {
        // Too fast or inside a wall: send them back to the last good spot.
        this.teleport(client, player.x, player.y);
        return;
      }

      guard.budget -= dist;
      player.x = msg.x;
      player.y = msg.y;
      player.dir = clampInt(msg.dir, 0, 3);
      player.moving = !!msg.moving;
      player.running = !!msg.running;
      // Walked away from the maze line? Leave the line.
      if (player.mazeReady && !this.maze.nearEntrance(player.x, player.y)) player.mazeReady = false;
    },
  };

  onCreate() {
    // Clients ask "what time is it?" to line their clock up with ours (for the
    // shared day/dusk cycle). They measure the round trip to correct for lag.
    this.onMessage("clock:ping", (client: Client, msg: { sent: number }) => client.send("clock:pong", { sent: msg?.sent, now: Date.now() }));

    // The short code doubles as the Colyseus room id, so joinById(code) works.
    this.roomId = claimRoomCode();
    this.state.race = new RaceState();
    this.state.hayride = new HayrideState();
    this.state.booth = new BoothState();

    new Emotes(this);
    this.race = new PickingRace(this);
    new Carving(this);
    new Benches(this);
    this.hayride = new Hayride(this);
    this.booth = new PhotoBooth(this);
    new GiantPumpkin(this);
    this.scarecrow = new Scarecrow(this);
    this.maze = new CornMaze(this);
    this.minigames = new Minigames(this);
    new PrizeStand(this);
    this.farmer = new Farmer(this);
    this.crow = new Crow(this, () => this.farmer.progress("crow"));
    this.state.startedAt = Date.now();

    // 20 updates per second for things that move on their own (wagon, crow).
    this.setSimulationInterval((dt) => {
      this.hayride.update(dt);
      this.crow.update(dt);
    }, 50);
    this.startEmptyTimer(); // in case the creator never actually arrives
    console.log(`room ${this.roomId} created`);
  }

  onJoin(client: Client, options: JoinOptions) {
    this.emptyTimer?.clear();
    // Take the first free slot (0 or 1); it decides spawn point and basket.
    const taken = new Set([...this.state.players.values()].map((p) => p.slot));
    const slot = taken.has(0) ? 1 : 0;
    const spawn = PATCH_MAP.spawns[slot];
    const name = cleanName(options?.name);

    this.state.players.set(client.sessionId, new PlayerState({
      name,
      color: clampInt(options?.color, 0, PLAYER_COLORS.length - 1),
      // Positions are tile centers in world pixels.
      x: spawn.x * TILE + TILE / 2,
      y: spawn.y * TILE + TILE / 2,
      dir: Dir.Down,
      moving: false,
      running: false,
      connected: true,
      slot,
      raceScore: 0,
    }));
    this.guards.set(client.sessionId, { budget: 0, lastTime: Date.now() });

    console.log(`${this.roomId}: ${client.sessionId} joined as "${name}"`);
  }

  /**
   * Called when a connection drops without the player choosing to leave
   * (Wi-Fi blip, laptop lid closed...). We hold their seat for a bit; the
   * client SDK retries automatically and lands in onReconnect if it succeeds.
   */
  onDrop(client: Client, code?: number) {
    // 1001 "going away" = the tab was closed or refreshed. They're not coming
    // back on this session, so skip the wait and free the seat right away
    // (Colyseus then calls onLeave for us).
    if (code === 1001) return;

    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = false;
    // Not awaited on purpose: Colyseus calls onReconnect or onLeave by itself.
    this.allowReconnection(client, PatchRoom.RECONNECT_SECONDS).catch(() => {});
  }

  onReconnect(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (player) {
      player.connected = true;
      player.moving = false;
    }
    const guard = this.guards.get(client.sessionId);
    if (guard) guard.lastTime = Date.now();
  }

  /** Player is gone for good (left on purpose, or never came back). */
  onLeave(client: Client, code: CloseCode) {
    console.log(`${this.roomId}: ${client.sessionId} left (code ${code})`);
    this.race.onPlayerLeave(client.sessionId);
    this.booth.leave(client.sessionId);
    this.scarecrow.onPlayerLeave(client.sessionId);
    this.maze.onPlayerLeave(client.sessionId);
    this.minigames.leave(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.guards.delete(client.sessionId);
    // Someone who left can no longer be "missing" from the wagon.
    this.hayride.onPlayerLeave();
    if (this.state.players.size === 0) this.startEmptyTimer();
  }

  /** Close the room if nobody (re)joins within EMPTY_ROOM_SECONDS. */
  private startEmptyTimer() {
    this.emptyTimer?.clear();
    this.emptyTimer = this.clock.setTimeout(() => {
      if (this.clients.length === 0) void this.disconnect();
    }, PatchRoom.EMPTY_ROOM_SECONDS * 1000);
  }

  onDispose() {
    console.log(`room ${this.roomId} disposed`);
    releaseRoomCode(this.roomId);
  }

  // ------------------------------------------------------------ helpers for activities

  blockedAt(x: number, y: number) {
    return this.collision.isBlocked(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  /** Move a player somewhere and tell their client to snap there. */
  teleport(client: Client, x: number, y: number) {
    const player = this.state.players.get(client.sessionId);
    if (player) {
      player.x = x;
      player.y = y;
      player.moving = false;
    }
    const guard = this.guards.get(client.sessionId);
    if (guard) guard.budget = 0;
    const msg: CorrectMessage = { x, y };
    client.send("teleport", msg);
  }

  clientOf(sessionId: string) {
    return this.clients.find((c) => c.sessionId === sessionId);
  }

  /** Is anyone (other than `except`) standing on / sitting at this tile? */
  isTileFree(tx: number, ty: number) {
    if (this.collision.isBlocked(tx, ty)) return false;
    for (const p of this.state.players.values()) {
      if (Math.floor(p.x / TILE) === tx && Math.floor(p.y / TILE) === ty) return false;
    }
    return true;
  }

  /** Distance in tiles between a player and the center of a tile. */
  tileDistance(player: PlayerState, tx: number, ty: number) {
    return Math.hypot(player.x - (tx * TILE + TILE / 2), player.y - (ty * TILE + TILE / 2)) / TILE;
  }

  /** Is the player busy with something that should block other activities? */
  isBusy(player: PlayerState, sessionId?: string) {
    if (player.seat || player.riding >= 0 || player.inBooth) return true;
    const id = sessionId ?? [...this.state.players.entries()].find(([, p]) => p === player)?.[0];
    return !!id && (this.maze.isInMaze(id) || this.minigames.isPlaying(id));
  }

  /** Give tickets to these players. */
  awardTickets(sessionIds: string[], amount: number) {
    for (const id of sessionIds) {
      const p = this.state.players.get(id);
      if (p) p.tickets = Math.min(65535, p.tickets + amount);
    }
  }
}

function clampInt(value: unknown, min: number, max: number) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/** Trim, strip odd characters, cap length, and never allow an empty name. */
function cleanName(value: unknown) {
  const name = String(value ?? "")
    .replace(/[^\p{L}\p{N} _\-'!?.]/gu, "")
    .trim()
    .slice(0, NAME_MAX);
  return name || "Friend";
}
