import type { Client } from "colyseus";
import type { PatchRoom } from "../PatchRoom.js";
import { GiantPumpkinState } from "../schema/ActivityState.js";
import { PATCH_MAP } from "../../../../shared/map/patchMap.js";
import { TILE, TICKETS, Dir } from "../../../../shared/constants.js";

const DEF = PATCH_MAP.giantPumpkin!;
/** A push counts as "at the same time" if it happened this recently (ms). */
const PUSH_WINDOW_MS = 350;
/** Minimum time between two rolls (ms) — it's heavy! */
const ROLL_COOLDOWN_MS = 380;
/** Players needed to move it. */
const PUSHERS_NEEDED = 2;
const VEC: Record<number, [number, number]> = { [Dir.Down]: [0, 1], [Dir.Left]: [-1, 0], [Dir.Right]: [1, 0], [Dir.Up]: [0, -1] };

/**
 * GIANT PUMPKIN PUSH (co-op)
 * A 2x2 pumpkin that only rolls when BOTH players push it the same way at
 * the same time. Pushing = walking into it; the client sends "giant:push"
 * with the direction while you're pressed against it. Roll it to the goal
 * beside the wagon → it gets loaded up and everyone earns tickets.
 */
export class GiantPumpkin {
  private pushes = new Map<string, { dir: number; at: number }>();
  private lastRoll = 0;

  constructor(private room: PatchRoom) {
    room.state.giant = new GiantPumpkinState({ tx: DEF.start.x, ty: DEF.start.y, phase: "idle", pushers: 0 });
    this.setBlocked(true);
    room.onMessage("giant:push", (client: Client, msg: { dir: number }) => this.push(client, Number(msg?.dir)));
  }

  private get g() { return this.room.state.giant; }

  private setBlocked(blocked: boolean) {
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) this.room.collision.setBlocked(this.g.tx + dx, this.g.ty + dy, blocked);
  }

  /** Is the player standing right against the side they'd push from? */
  private isPushingFrom(sessionId: string, dir: number) {
    const p = this.room.state.players.get(sessionId);
    if (!p || this.room.isBusy(p)) return false;
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    const { tx: gx, ty: gy } = this.g;
    switch (dir) {
      case Dir.Left: return tx === gx + 2 && (ty === gy || ty === gy + 1);
      case Dir.Right: return tx === gx - 1 && (ty === gy || ty === gy + 1);
      case Dir.Up: return ty === gy + 2 && (tx === gx || tx === gx + 1);
      case Dir.Down: return ty === gy - 1 && (tx === gx || tx === gx + 1);
    }
    return false;
  }

  private push(client: Client, dir: number) {
    if (this.g.phase !== "idle" || !(dir in VEC)) return;
    if (!this.isPushingFrom(client.sessionId, dir)) return;
    const now = Date.now();
    this.pushes.set(client.sessionId, { dir, at: now });

    // Who's pushing this same way right now?
    const together = [...this.pushes.entries()].filter(
      ([id, p]) => p.dir === dir && now - p.at < PUSH_WINDOW_MS && this.isPushingFrom(id, dir),
    );
    this.g.pushers = together.length;
    if (together.length < PUSHERS_NEEDED || now - this.lastRoll < ROLL_COOLDOWN_MS) return;

    // Room to roll? The two tiles it moves into must be open.
    const [dx, dy] = VEC[dir];
    const { tx, ty } = this.g;
    const ahead = dx !== 0
      ? [[dx > 0 ? tx + 2 : tx - 1, ty], [dx > 0 ? tx + 2 : tx - 1, ty + 1]]
      : [[tx, dy > 0 ? ty + 2 : ty - 1], [tx + 1, dy > 0 ? ty + 2 : ty - 1]];
    if (!ahead.every(([x, y]) => this.room.isTileFree(x, y))) return;

    this.setBlocked(false);
    this.g.tx += dx;
    this.g.ty += dy;
    this.setBlocked(true);
    this.lastRoll = now;

    if (this.g.tx === DEF.goal.x && this.g.ty === DEF.goal.y) this.loaded();
  }

  private loaded() {
    this.g.phase = "loaded";
    this.g.pushers = 0;
    this.room.awardTickets([...this.room.state.players.keys()], TICKETS.giantPumpkin);
    this.room.broadcast("toast", { text: `The giant pumpkin is loaded! +${TICKETS.giantPumpkin} tickets each 🎟` });
    // A new giant pumpkin "grows" back at the start after a while.
    this.room.clock.setTimeout(() => this.reset(), 12_000);
  }

  private reset() {
    // Wait if someone is standing where it regrows.
    const free = [0, 1].every((dx) => [0, 1].every((dy) => this.room.isTileFree(DEF.start.x + dx, DEF.start.y + dy) || this.isGiantTile(DEF.start.x + dx, DEF.start.y + dy)));
    if (!free) { this.room.clock.setTimeout(() => this.reset(), 2000); return; }
    this.setBlocked(false);
    this.g.tx = DEF.start.x;
    this.g.ty = DEF.start.y;
    this.g.phase = "idle";
    this.setBlocked(true);
  }

  private isGiantTile(x: number, y: number) {
    return x >= this.g.tx && x < this.g.tx + 2 && y >= this.g.ty && y < this.g.ty + 2;
  }
}
