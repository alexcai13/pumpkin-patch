import type { Client } from "colyseus";
import type { PatchRoom } from "../PatchRoom.js";
import { PATCH_MAP } from "../../../../shared/map/patchMap.js";
import { TILE, Dir } from "../../../../shared/constants.js";
import type { SitMessage } from "../../../../shared/messages.js";

const BENCHES = PATCH_MAP.props.filter((p) => p.type === "bench");

/**
 * CIDER STAND BENCHES
 * Sitting is server-side so both players agree on who sits where. Each
 * 2-tile bench has 2 seats ("bench1:0", "bench1:1"). The seat tile itself is
 * solid (you can't WALK onto a bench), so the server places you there and
 * back off again when you stand up.
 * The cozy zoom + leaves effect is purely on the client (scene "CiderCozy").
 */
export class Benches {
  constructor(private room: PatchRoom) {
    room.onMessage("bench:sit", (client: Client, msg: SitMessage) => this.sit(client, msg));
    room.onMessage("bench:stand", (client: Client) => this.stand(client));
  }

  private seatTaken(seat: string) {
    return [...this.room.state.players.values()].some((p) => p.seat === seat);
  }

  private sit(client: Client, msg: SitMessage) {
    const player = this.room.state.players.get(client.sessionId);
    const bench = BENCHES.find((b) => b.id === msg?.bench);
    if (!player || !bench || this.room.isBusy(player) || player.carrying) return;

    // Closest free seat within reach.
    let best = -1, bestDist = Infinity;
    for (let i = 0; i < bench.w; i++) {
      const d = this.room.tileDistance(player, bench.x + i, bench.y);
      if (d < bestDist && d <= 1.6 && !this.seatTaken(`${bench.id}:${i}`)) { best = i; bestDist = d; }
    }
    if (best === -1) return;

    player.seat = `${bench.id}:${best}`;
    player.x = (bench.x + best) * TILE + TILE / 2;
    player.y = bench.y * TILE + TILE / 2;
    player.dir = Dir.Down;
    player.moving = false;
  }

  private stand(client: Client) {
    const player = this.room.state.players.get(client.sessionId);
    if (!player || !player.seat) return;
    const [id, index] = player.seat.split(":");
    const bench = BENCHES.find((b) => b.id === id)!;
    player.seat = "";

    // Step off in front of the seat (or beside / behind it if that's taken).
    const sx = bench.x + Number(index), sy = bench.y;
    const options = [[sx, sy + 1], [sx - 1, sy], [sx + 1, sy], [sx, sy - 1], [sx - 1, sy + 1], [sx + 1, sy + 1]];
    const free = options.find(([x, y]) => this.room.isTileFree(x, y)) ?? options[0];
    this.room.teleport(client, free[0] * TILE + TILE / 2, free[1] * TILE + TILE / 2);
  }
}
