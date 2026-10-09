import type { Client } from "colyseus";
import type { PatchRoom } from "../PatchRoom.js";
import { PATCH_MAP } from "../../../../shared/map/patchMap.js";
import { prizeById, DEFAULT_PUMPKIN } from "../../../../shared/prizes.js";

const STAND = PATCH_MAP.props.find((p) => p.id === "prizeStand")!;

/**
 * PRIZE STAND: spend tickets on hats and pumpkin colors (catalog in
 * shared/prizes.ts). Buying needs enough tickets and being at the stand;
 * equipping something you own works anytime from the shop screen.
 * What you wear is on PlayerState, so your friend sees it too.
 */
export class PrizeStand {
  constructor(private room: PatchRoom) {
    room.onMessage("shop:buy", (client: Client, msg: { id: string }) => this.buy(client, String(msg?.id)));
    room.onMessage("shop:equip", (client: Client, msg: { id: string }) => this.equip(client, String(msg?.id)));
  }

  private nearStand(client: Client) {
    const p = this.room.state.players.get(client.sessionId)!;
    const cx = (STAND.x + STAND.w / 2) * 16, cy = (STAND.y + STAND.h) * 16;
    return Math.hypot(p.x - cx, p.y - cy) / 16 <= 4;
  }

  private buy(client: Client, id: string) {
    const player = this.room.state.players.get(client.sessionId);
    const prize = prizeById(id);
    if (!player || !prize || !this.nearStand(client)) return;
    const owned = player.owned ? player.owned.split(",") : [];
    if (owned.includes(id)) return this.equip(client, id);
    if (player.tickets < prize.cost) {
      client.send("toast", { text: `You need ${prize.cost - player.tickets} more tickets for the ${prize.name}.` });
      return;
    }
    player.tickets -= prize.cost;
    player.owned = [...owned, id].join(",");
    this.equip(client, id);
    client.send("shop:bought", { id });
  }

  /** Wear a hat / use a pumpkin color you own. "" takes your hat off; "orange" = default pumpkins. */
  private equip(client: Client, id: string) {
    const player = this.room.state.players.get(client.sessionId);
    if (!player) return;
    if (id === "" || id === "nohat") { player.hat = ""; return; }
    if (id === DEFAULT_PUMPKIN) { player.pumpkinColor = DEFAULT_PUMPKIN; return; }
    const prize = prizeById(id);
    if (!prize || !player.owned.split(",").includes(id)) return;
    if (prize.kind === "hat") player.hat = id;
    else player.pumpkinColor = id;
  }
}
