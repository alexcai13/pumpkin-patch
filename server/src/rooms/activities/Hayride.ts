import type { Client } from "colyseus";
import type { PatchRoom } from "../PatchRoom.js";
import { PATCH_MAP } from "../../../../shared/map/patchMap.js";
import { TILE, HAYRIDE } from "../../../../shared/constants.js";

const DEF = PATCH_MAP.hayride!;
/** Wagon center when parked, in pixels. */
const HOME_X = (DEF.home.x + DEF.home.w / 2) * TILE;
const HOME_Y = (DEF.home.y + DEF.home.h / 2) * TILE;

/**
 * HAYRIDE (co-op + fast travel)
 *
 *  parked at home ──(everyone aboard, 2s)──▶ moving ──▶ stopped at a station (6s) ──▶ moving ──▶ … ──▶ parked
 *
 * - Board with E when standing next to the wagon while it isn't moving.
 * - While moving, riders are locked in their seat.
 * - At a station (or home) riders can hop off with E — that's the fast travel.
 * - The server moves the wagon 20x per second; clients smooth it out.
 * - While parked at home the wagon blocks its tiles like any other object.
 */
export class Hayride {
  /** Index of the route point we're driving toward. */
  private target = 0;
  /** Countdown (seconds) while waiting to leave home or a station. */
  private waitLeft = 0;

  constructor(private room: PatchRoom) {
    const h = room.state.hayride;
    h.x = HOME_X;
    h.y = HOME_Y;
    h.phase = "parked";
    this.setHomeBlocked(true);
    room.onMessage("hayride:board", (client: Client) => this.board(client));
    room.onMessage("hayride:hop", (client: Client) => this.hop(client));
  }

  private get h() { return this.room.state.hayride; }

  private riders() {
    return [...this.room.state.players.values()].filter((p) => p.riding >= 0);
  }

  private setHomeBlocked(blocked: boolean) {
    for (let dy = 0; dy < DEF.home.h; dy++) {
      for (let dx = 0; dx < DEF.home.w; dx++) this.room.collision.setBlocked(DEF.home.x + dx, DEF.home.y + dy, blocked);
    }
  }

  /** Distance (tiles) from a point to the wagon's 4x2 rectangle. */
  private distanceToWagon(x: number, y: number) {
    const halfW = (DEF.home.w / 2) * TILE, halfH = (DEF.home.h / 2) * TILE;
    const dx = Math.max(0, Math.abs(x - this.h.x) - halfW);
    const dy = Math.max(0, Math.abs(y - this.h.y) - halfH);
    return Math.hypot(dx, dy) / TILE;
  }

  private board(client: Client) {
    const player = this.room.state.players.get(client.sessionId);
    if (!player || this.room.isBusy(player) || this.h.phase === "moving") return;
    if (this.distanceToWagon(player.x, player.y) > 1.2) return;
    const taken = new Set(this.riders().map((p) => p.riding));
    const seat = taken.has(0) ? (taken.has(1) ? -1 : 1) : 0;
    if (seat === -1) return;
    player.carrying = "";
    player.riding = seat;
    player.moving = false;
    this.placeRiders();
    this.checkEveryoneAboard();
  }

  private hop(client: Client) {
    const player = this.room.state.players.get(client.sessionId);
    if (!player || player.riding < 0 || this.h.phase === "moving") return;
    player.riding = -1;

    // Find a free tile just outside the wagon, preferring below it.
    const left = Math.round(this.h.x / TILE - DEF.home.w / 2);
    const top = Math.round(this.h.y / TILE - DEF.home.h / 2);
    const ring: [number, number][] = [];
    for (let dx = 0; dx < DEF.home.w; dx++) ring.push([left + dx, top + DEF.home.h]);
    for (let dy = 0; dy < DEF.home.h; dy++) ring.push([left - 1, top + dy], [left + DEF.home.w, top + dy]);
    for (let dx = 0; dx < DEF.home.w; dx++) ring.push([left + dx, top - 1]);
    const free = ring.find(([x, y]) => this.room.isTileFree(x, y)) ?? ring[0];
    this.room.teleport(client, free[0] * TILE + TILE / 2, free[1] * TILE + TILE / 2);

    // Hopping off at home cancels the departure countdown (not everyone's aboard now).
    if (this.h.phase === "parked") this.checkEveryoneAboard();
  }

  /** At home: once every connected player is aboard, leave after a short delay. */
  private checkEveryoneAboard() {
    if (this.h.phase !== "parked") return;
    const players = [...this.room.state.players.values()].filter((p) => p.connected);
    const allAboard = players.length > 0 && players.every((p) => p.riding >= 0);
    this.waitLeft = allAboard ? HAYRIDE.departDelaySeconds : 0;
    this.h.departIn = Math.ceil(this.waitLeft);
  }

  onPlayerLeave() {
    // The leaver might have been the last one missing (or a rider).
    this.room.clock.setTimeout(() => this.checkEveryoneAboard(), 0);
  }

  /** Riders' synced positions follow the wagon. */
  private placeRiders() {
    for (const p of this.riders()) {
      const seat = HAYRIDE.seats[p.riding];
      p.x = this.h.x + seat.x;
      p.y = this.h.y + seat.y;
    }
  }

  update(dtMs: number) {
    const dt = dtMs / 1000;
    const h = this.h;

    if (h.phase === "parked" || h.phase === "stopped") {
      if (this.waitLeft <= 0) return;
      this.waitLeft -= dt;
      h.departIn = Math.max(0, Math.ceil(this.waitLeft));
      if (this.waitLeft > 0) return;
      // Time to go.
      if (h.phase === "parked") {
        if (this.riders().length === 0) return; // everyone hopped off: stay
        this.target = 0;
        this.setHomeBlocked(false);
      }
      h.phase = "moving";
      h.stopName = "";
      return;
    }

    // Moving: drive toward the current route point.
    const point = DEF.route[this.target];
    const tx = point.x * TILE, ty = point.y * TILE;
    const dx = tx - h.x, dy = ty - h.y;
    const dist = Math.hypot(dx, dy);
    const step = HAYRIDE.speed * dt;

    if (Math.abs(dx) > 0.5) h.facingLeft = dx < 0;
    if (dist <= step) {
      h.x = tx; h.y = ty;
      this.arrive();
    } else {
      h.x += (dx / dist) * step;
      h.y += (dy / dist) * step;
    }
    this.placeRiders();
  }

  private arrive() {
    const point = DEF.route[this.target];
    const h = this.h;
    if (this.target === DEF.route.length - 1) {
      // Back home: park. Riders can hop off now; if they stay aboard it goes again.
      h.phase = "parked";
      h.facingLeft = false;
      this.setHomeBlocked(true);
      this.waitLeft = 0;
      this.checkEveryoneAboard();
      if (this.waitLeft > 0) this.waitLeft = HAYRIDE.stopSeconds; // give them time to hop off
      return;
    }
    this.target++;
    if (point.stop) {
      h.phase = "stopped";
      h.stopName = point.stop;
      this.waitLeft = HAYRIDE.stopSeconds;
      h.departIn = HAYRIDE.stopSeconds;
    }
  }
}
