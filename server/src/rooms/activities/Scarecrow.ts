import type { Client } from "colyseus";
import type { PatchRoom } from "../PatchRoom.js";
import { ScarecrowState, ScarecrowPartState } from "../schema/ActivityState.js";
import { PATCH_MAP } from "../../../../shared/map/patchMap.js";
import { SCARECROW_PARTS, PART_NAMES, TICKETS, type ScarecrowPart } from "../../../../shared/constants.js";

const POST = PATCH_MAP.props.find((p) => p.id === "scarecrowPost")!;
const REACH = 1.6;
const isPart = (k: string): k is ScarecrowPart => (SCARECROW_PARTS as readonly string[]).includes(k);

/**
 * SCARECROW BUILDING (co-op)
 * A hat, a shirt and some stuffing are hidden on 3 random spots (picked from
 * PATCH_MAP.scarecrowSpots when the room opens). Either player can pick one
 * up (it's carried overhead) and bring it to the post. Once all three are
 * on, the scarecrow is built for the rest of the session.
 */
export class Scarecrow {
  /** Where each part was hidden, so it can go back if its carrier leaves. */
  private home = new Map<ScarecrowPart, { x: number; y: number }>();

  constructor(private room: PatchRoom) {
    room.state.scarecrow = new ScarecrowState();
    const spots = [...(PATCH_MAP.scarecrowSpots ?? [])].sort(() => Math.random() - 0.5);
    SCARECROW_PARTS.forEach((kind, i) => {
      const spot = spots[i];
      this.home.set(kind, spot);
      room.state.scarecrow.parts.set(kind, new ScarecrowPartState({ kind, tx: spot.x, ty: spot.y }));
    });
    room.onMessage("scarecrow:pick", (client: Client, msg: { kind: string }) => this.pick(client, String(msg?.kind)));
    room.onMessage("scarecrow:place", (client: Client) => this.place(client));
  }

  private get s() { return this.room.state.scarecrow; }

  private pick(client: Client, kind: string) {
    const player = this.room.state.players.get(client.sessionId);
    const part = this.s.parts.get(kind);
    if (!player || !part || player.carrying || this.room.isBusy(player)) return;
    if (this.room.tileDistance(player, part.tx, part.ty) > REACH) return;
    this.s.parts.delete(kind);
    player.carrying = kind;
  }

  private place(client: Client) {
    const player = this.room.state.players.get(client.sessionId);
    if (!player || !isPart(player.carrying)) return;
    if (this.room.tileDistance(player, POST.x, POST.y) > REACH) return;
    const kind = player.carrying;
    player.carrying = "";
    this.s[kind] = true;
    this.room.broadcast("toast", { text: `${player.name} added the ${PART_NAMES[kind]} to the scarecrow!` });
    if (this.s.hat && this.s.shirt && this.s.stuffing && !this.s.built) {
      this.s.built = true;
      this.room.awardTickets([...this.room.state.players.keys()], TICKETS.scarecrow);
      this.room.broadcast("toast", { text: `The scarecrow is complete! +${TICKETS.scarecrow} tickets each 🎟` });
    }
  }

  /** Someone left while holding a part: put it back where it was hidden. */
  onPlayerLeave(sessionId: string) {
    const player = this.room.state.players.get(sessionId);
    if (!player || !isPart(player.carrying)) return;
    const spot = this.home.get(player.carrying)!;
    this.s.parts.set(player.carrying, new ScarecrowPartState({ kind: player.carrying, tx: spot.x, ty: spot.y }));
  }
}
