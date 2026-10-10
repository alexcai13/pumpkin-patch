import type { Client } from "colyseus";
import type { PatchRoom } from "../PatchRoom.js";
import { MazeState, MazePlayerState } from "../schema/ActivityState.js";
import { PATCH_MAP } from "../../../../shared/map/patchMap.js";
import { CollisionGrid } from "../../../../shared/map/collision.js";
import { generateMaze, type Maze } from "../../../../shared/maze.js";
import { TILE, TICKETS, Dir } from "../../../../shared/constants.js";
import type { MoveMessage } from "../../../../shared/messages.js";

const ENTRANCE = PATCH_MAP.mazeEntrance!;
/** Where players reappear in the patch afterwards: just below the arch. */
const RETURN_TILES = [{ x: ENTRANCE.x, y: ENTRANCE.y + ENTRANCE.h }, { x: ENTRANCE.x + 1, y: ENTRANCE.y + ENTRANCE.h }];
/** How long the "you made it!" screen shows before heading back (ms). */
const DONE_PAUSE_MS = 6000;

/**
 * CORN MAZE (co-op)
 * Press E at the maze arch to get in line; when everyone in the room is in
 * line, a fresh maze is generated (from a random seed) and both players go
 * in. It's dark in the corn — each player only sees a little circle
 * around themselves, with a map they can show/hide (M). Anyone can walk out
 * at any time (Esc / "Leave maze"); whoever's left can still finish.
 * The run ends when both stand in the exit clearing.
 *
 * Movement inside the maze uses "maze:move" (positions live in
 * state.maze.players, separate from your spot in the patch).
 */
export class CornMaze {
  private maze?: Maze;
  private grid?: CollisionGrid;

  constructor(private room: PatchRoom) {
    room.state.maze = new MazeState();
    room.onMessage("maze:enter", (client: Client) => this.enter(client));
    room.onMessage("maze:cancel", (client: Client) => { const p = room.state.players.get(client.sessionId); if (p) p.mazeReady = false; });
    room.onMessage("maze:move", (client: Client, msg: MoveMessage) => this.move(client, msg));
    room.onMessage("maze:leave", (client: Client) => this.leave(client.sessionId));
  }

  private get m() { return this.room.state.maze; }

  isInMaze(sessionId: string) {
    return this.m.phase !== "idle" && this.m.players.has(sessionId);
  }

  /** Is this player close enough to the arch to queue up? */
  nearEntrance(x: number, y: number) {
    const cx = (ENTRANCE.x + ENTRANCE.w / 2) * TILE, cy = (ENTRANCE.y + ENTRANCE.h / 2) * TILE;
    return Math.hypot(x - cx, y - cy) / TILE <= 3;
  }

  private enter(client: Client) {
    const player = this.room.state.players.get(client.sessionId);
    if (!player || this.m.phase !== "idle" || this.room.isBusy(player) || player.carrying) return;
    if (!this.nearEntrance(player.x, player.y)) return;
    player.mazeReady = true;
    const everyone = [...this.room.state.players.values()].filter((p) => p.connected);
    if (everyone.every((p) => p.mazeReady)) this.start();
    else this.room.broadcast("toast", { text: `${player.name} is waiting at the corn maze — join them!` });
  }

  private start() {
    const ids = [...this.room.state.players.entries()].filter(([, p]) => p.mazeReady).map(([id]) => id);
    this.m.seed = (Math.random() * 2 ** 31) >>> 0;
    this.maze = generateMaze(this.m.seed);
    this.grid = new CollisionGrid(this.maze.map);
    this.m.players.clear();
    ids.forEach((id, i) => {
      const s = this.maze!.start[i % this.maze!.start.length];
      this.m.players.set(id, new MazePlayerState({ x: s.x * TILE + TILE / 2, y: s.y * TILE + TILE / 2, dir: Dir.Up, moving: false }));
      this.room.state.players.get(id)!.mazeReady = false;
    });
    this.m.finishMs = 0;
    this.m.startedAt = Date.now();
    this.m.phase = "running";
  }

  private move(client: Client, msg: MoveMessage) {
    const mp = this.m.players.get(client.sessionId);
    if (!mp || this.m.phase !== "running" || !this.grid || !msg) return;
    if (!Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return;
    const tooFar = Math.hypot(msg.x - mp.x, msg.y - mp.y) > TILE * 3;
    const intoWall = this.grid.isBlocked(Math.floor(msg.x / TILE), Math.floor(msg.y / TILE));
    if (tooFar || intoWall) {
      client.send("maze:teleport", { x: mp.x, y: mp.y });
      return;
    }
    mp.x = msg.x; mp.y = msg.y;
    mp.dir = Math.max(0, Math.min(3, Math.round(msg.dir)));
    mp.moving = !!msg.moving;
    this.checkFinish();
  }

  private checkFinish() {
    const exit = this.maze!.exit;
    const inExit = (p: { x: number; y: number }) => {
      const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
      return tx >= exit.x && ty >= exit.y && tx < exit.x + exit.w && ty < exit.y + exit.h;
    };
    if (![...this.m.players.values()].every(inExit)) return;
    this.m.finishMs = Date.now() - this.m.startedAt;
    if (!this.m.bestMs || this.m.finishMs < this.m.bestMs) this.m.bestMs = this.m.finishMs;
    this.m.phase = "done";
    this.room.awardTickets([...this.m.players.keys()], TICKETS.maze);
    this.room.clock.setTimeout(() => this.end(), DONE_PAUSE_MS);
  }

  /** Send everyone back to the patch, next to the arch. */
  end(reason?: string) {
    if (this.m.phase === "idle") return;
    [...this.m.players.keys()].forEach((id, i) => {
      const client = this.room.clientOf(id);
      const t = RETURN_TILES[i % RETURN_TILES.length];
      if (client) this.room.teleport(client, t.x * TILE + TILE / 2, t.y * TILE + TILE / 2);
    });
    this.m.players.clear();
    this.m.phase = "idle";
    if (reason) this.room.broadcast("toast", { text: reason });
  }

  /**
   * One player walks out of the maze (any time). They go back to the arch;
   * anyone still inside can keep going and finish on their own.
   */
  leave(sessionId: string) {
    if (!this.isInMaze(sessionId)) return;
    const name = this.room.state.players.get(sessionId)?.name ?? "Someone";
    this.m.players.delete(sessionId);
    const client = this.room.clientOf(sessionId);
    if (client) this.room.teleport(client, RETURN_TILES[0].x * TILE + TILE / 2, RETURN_TILES[0].y * TILE + TILE / 2);
    if (this.m.players.size === 0) { this.end(); return; }
    for (const id of this.m.players.keys()) {
      this.room.clientOf(id)?.send("toast", { text: `${name} left the maze — you can still find the exit on your own!` });
    }
    // The ones still inside might already be standing at the exit.
    if (this.m.phase === "running") this.checkFinish();
  }

  onPlayerLeave(sessionId: string) {
    this.leave(sessionId);
  }
}
