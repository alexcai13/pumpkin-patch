import { Room, Client, CloseCode } from "colyseus";
import { PatchState } from "./schema/PatchState.js";
import { PlayerState } from "./schema/PlayerState.js";
import { claimRoomCode, releaseRoomCode } from "./roomCodes.js";
import { PATCH_MAP } from "../../../shared/map/patchMap.js";
import { CollisionGrid } from "../../../shared/map/collision.js";
import {
  TILE, MAX_PLAYERS, PLAYER_COLORS, NAME_MAX, RUN_STEP_MS, Dir,
} from "../../../shared/constants.js";
import type { JoinOptions, MoveMessage, CorrectMessage } from "../../../shared/messages.js";

/** Built once and shared by every room: the map never changes at runtime. */
const collision = new CollisionGrid(PATCH_MAP);

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
  spawnIndex: number;
}

export class PatchRoom extends Room<{ state: PatchState }> {
  maxClients = MAX_PLAYERS;
  state = new PatchState();

  /** Seconds the server holds a dropped player's seat before removing them. */
  static RECONNECT_SECONDS = 15;

  private guards = new Map<string, MoveGuard>();

  messages = {
    /** A client reports where its own character is (≈15 times per second). */
    move: (client: Client, msg: MoveMessage) => {
      const player = this.state.players.get(client.sessionId);
      const guard = this.guards.get(client.sessionId);
      if (!player || !guard || !msg) return;
      if (!Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return;

      // Refill the movement budget for the time that passed.
      const now = Date.now();
      guard.budget = Math.min(MAX_BUDGET, guard.budget + ((now - guard.lastTime) / 1000) * MAX_SPEED);
      guard.lastTime = now;

      const dist = Math.hypot(msg.x - player.x, msg.y - player.y);
      const tx = Math.floor(msg.x / TILE);
      const ty = Math.floor(msg.y / TILE);

      if (dist > guard.budget || collision.isBlocked(tx, ty)) {
        // Too fast or inside a wall: send them back to the last good spot.
        const correction: CorrectMessage = { x: player.x, y: player.y };
        client.send("correct", correction);
        return;
      }

      guard.budget -= dist;
      player.x = msg.x;
      player.y = msg.y;
      player.dir = clampInt(msg.dir, 0, 3);
      player.moving = !!msg.moving;
      player.running = !!msg.running;
    },
  };

  onCreate() {
    // The short code doubles as the Colyseus room id, so joinById(code) works.
    this.roomId = claimRoomCode();
    console.log(`room ${this.roomId} created`);
  }

  onJoin(client: Client, options: JoinOptions) {
    // Pick the first spawn point nobody is standing on yet.
    const taken = new Set([...this.guards.values()].map((g) => g.spawnIndex));
    const spawnIndex = PATCH_MAP.spawns.findIndex((_, i) => !taken.has(i));
    const spawn = PATCH_MAP.spawns[Math.max(0, spawnIndex)];

    this.state.players.set(client.sessionId, new PlayerState({
      name: cleanName(options?.name),
      color: clampInt(options?.color, 0, PLAYER_COLORS.length - 1),
      // Positions are tile centers in world pixels.
      x: spawn.x * TILE + TILE / 2,
      y: spawn.y * TILE + TILE / 2,
      dir: Dir.Down,
      moving: false,
      running: false,
      connected: true,
    }));
    this.guards.set(client.sessionId, { budget: 0, lastTime: Date.now(), spawnIndex: Math.max(0, spawnIndex) });

    console.log(`${this.roomId}: ${client.sessionId} joined as "${cleanName(options?.name)}"`);
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
    this.state.players.delete(client.sessionId);
    this.guards.delete(client.sessionId);
  }

  onDispose() {
    console.log(`room ${this.roomId} disposed`);
    releaseRoomCode(this.roomId);
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
