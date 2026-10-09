import type { Client } from "colyseus";
import type { PatchRoom } from "../PatchRoom.js";
import { EMOTES } from "../../../../shared/constants.js";
import type { EmoteMessage, EmoteBroadcast } from "../../../../shared/messages.js";

/** Minimum time between two emotes from the same player. */
const COOLDOWN_MS = 400;

/**
 * Emotes are quick, throwaway effects, so they're sent as a broadcast message
 * instead of being stored in the synced state.
 */
export class Emotes {
  private lastEmote = new Map<string, number>();

  constructor(room: PatchRoom) {
    room.onMessage("emote", (client: Client, msg: EmoteMessage) => {
      const kind = Math.floor(Number(msg?.kind));
      if (!(kind >= 0 && kind < EMOTES.length)) return;
      const now = Date.now();
      if (now - (this.lastEmote.get(client.sessionId) ?? 0) < COOLDOWN_MS) return;
      this.lastEmote.set(client.sessionId, now);
      const out: EmoteBroadcast = { sessionId: client.sessionId, kind };
      room.broadcast("emote", out);
    });
  }
}
