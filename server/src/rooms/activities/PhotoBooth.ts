import type { Client, Delayed } from "colyseus";
import type { PatchRoom } from "../PatchRoom.js";
import { PATCH_MAP } from "../../../../shared/map/patchMap.js";
import { BOOTH } from "../../../../shared/constants.js";
import type { RtcSignal, RtcRelay, SnapMessage } from "../../../../shared/messages.js";

const BOOTH_PROP = PATCH_MAP.props.find((p) => p.id === "photoBooth")!;
/** The open tile inside the booth frame (middle column, bottom row). */
const INSIDE = { x: BOOTH_PROP.x + 1, y: BOOTH_PROP.y + 2 };

/**
 * PHOTO BOOTH (server side)
 *
 * The server does three small jobs here:
 *  1. Tracks who has the booth open (PlayerState.inBooth).
 *  2. Relays WebRTC setup messages ("rtc") between the two players so their
 *     browsers can connect directly for live video. The video never passes
 *     through the server.
 *  3. Runs the shared timer: 3-2-1 → "booth:snap" (×4). Each browser takes
 *     the photos itself from the two video feeds it's showing, so both end
 *     up with the same strip.
 */
export class PhotoBooth {
  private timer?: Delayed;

  constructor(private room: PatchRoom) {
    room.onMessage("booth:enter", (client: Client) => this.enter(client));
    room.onMessage("booth:leave", (client: Client) => this.leave(client.sessionId));
    room.onMessage("booth:start", (client: Client) => this.start(client));
    room.onMessage("rtc", (client: Client, signal: RtcSignal) => this.relay(client, signal));
  }

  private get booth() { return this.room.state.booth; }

  private members() {
    return [...this.room.state.players.entries()].filter(([, p]) => p.inBooth);
  }

  private enter(client: Client) {
    const player = this.room.state.players.get(client.sessionId);
    if (!player || player.inBooth) return;
    if (this.room.isBusy(player)) {
      client.send("booth:denied", { reason: "Get off the bench / wagon first, then come back to the booth." });
      return;
    }
    // Must be standing in (or right in front of) the booth. A little slack,
    // because the server's copy of your position can be a step behind.
    if (this.room.tileDistance(player, INSIDE.x, INSIDE.y) > 3) {
      client.send("booth:denied", { reason: "Step inside the booth frame, then press E again." });
      return;
    }
    player.inBooth = true;
  }

  leave(sessionId: string) {
    const player = this.room.state.players.get(sessionId);
    if (player) player.inBooth = false;
    // Nobody left to photograph: cancel a shoot in progress.
    if (this.members().filter(([id]) => id !== sessionId).length === 0) {
      this.timer?.clear();
      this.booth.phase = "idle";
      this.booth.shot = 0;
      this.booth.countdown = 0;
    }
  }

  private start(client: Client) {
    const player = this.room.state.players.get(client.sessionId);
    if (!player?.inBooth || this.booth.phase === "shooting") return;
    this.booth.phase = "shooting";
    this.booth.shot = 1;
    this.booth.countdown = BOOTH.countdownSeconds;
    this.timer?.clear();
    this.tick();
  }

  /** One second of the shoot: count down, snap, pause, next photo... */
  private tick() {
    const b = this.booth;
    if (b.phase !== "shooting") return;
    if (b.countdown > 0) {
      this.timer = this.room.clock.setTimeout(() => {
        b.countdown--;
        if (b.countdown === 0) this.snap();
        else this.tick();
      }, 1000);
    }
  }

  private snap() {
    const b = this.booth;
    const msg: SnapMessage = { shot: b.shot };
    for (const [id] of this.members()) this.room.clientOf(id)?.send("booth:snap", msg);
    this.timer = this.room.clock.setTimeout(() => {
      if (b.shot >= BOOTH.shots) {
        b.phase = "done";
        return;
      }
      b.shot++;
      b.countdown = BOOTH.countdownSeconds;
      this.tick();
    }, BOOTH.pauseMs);
  }

  /** Pass a WebRTC message to the OTHER player, if they're in the booth too. */
  private relay(client: Client, signal: RtcSignal) {
    if (!signal || typeof signal !== "object") return;
    const me = this.room.state.players.get(client.sessionId);
    if (!me?.inBooth) return;
    // Size cap: real offers/answers are a few KB.
    if (JSON.stringify(signal).length > 20_000) return;
    for (const [id] of this.members()) {
      if (id === client.sessionId) continue;
      const out: RtcRelay = { from: client.sessionId, signal };
      this.room.clientOf(id)?.send("rtc", out);
    }
  }
}
