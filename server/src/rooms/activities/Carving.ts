import type { Client } from "colyseus";
import type { PatchRoom } from "../PatchRoom.js";
import { CarvingState } from "../schema/ActivityState.js";
import { PATCH_MAP } from "../../../../shared/map/patchMap.js";
import { isValidCarving } from "../../../../shared/carving.js";
import type { CarveMessage } from "../../../../shared/messages.js";

const TABLES = PATCH_MAP.props.filter((p) => p.type === "carvingTable");
const SPOTS = PATCH_MAP.porchSpots ?? [];

/**
 * CARVING STATION
 * The drawing happens entirely on the carver's screen (client scene
 * "Carving"). When they press Done, the finished face arrives here, gets a
 * spot on the porch, and is synced to both players for the rest of the session.
 * If the porch fills up, the oldest carving makes room for the new one.
 */
export class Carving {
  private nextId = 1;

  constructor(private room: PatchRoom) {
    room.onMessage("carve:submit", (client: Client, msg: CarveMessage) => this.submit(client, msg));
  }

  private submit(client: Client, msg: CarveMessage) {
    const player = this.room.state.players.get(client.sessionId);
    if (!player || !isValidCarving(msg?.mask) || SPOTS.length === 0) return;
    // Must be standing near a carving table.
    const nearTable = TABLES.some((t) => {
      for (let dx = 0; dx < t.w; dx++) if (this.room.tileDistance(player, t.x + dx, t.y) <= 2) return true;
      return false;
    });
    if (!nearTable) return;

    const carvings = this.room.state.carvings;
    const used = new Set([...carvings].map((c) => c.spot));
    let spot = SPOTS.findIndex((_, i) => !used.has(i));
    if (spot === -1) {
      spot = carvings[0].spot; // porch full: replace the oldest
      carvings.shift();
    }
    carvings.push(new CarvingState({
      id: `c${this.nextId++}`, owner: player.name, color: player.color, mask: msg.mask, spot,
      pumpkinColor: player.pumpkinColor,
    }));
    this.room.farmer.progress("carve");
  }
}
