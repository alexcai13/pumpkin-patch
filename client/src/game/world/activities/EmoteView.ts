import * as Phaser from "phaser";
import type { EmoteBroadcast } from "../../../../../shared/messages";
import type { WorldContext } from "../WorldContext";

/**
 * EMOTES: number keys 1-4 → heart, laugh, wave, "!".
 * The server re-broadcasts each emote to both players, so you see your own
 * bubble at the same moment your friend does.
 */
export class EmoteView {
  constructor(ctx: WorldContext) {
    const K = Phaser.Input.Keyboard.KeyCodes;
    const keys = [[K.ONE, K.NUMPAD_ONE], [K.TWO, K.NUMPAD_TWO], [K.THREE, K.NUMPAD_THREE], [K.FOUR, K.NUMPAD_FOUR]];
    keys.forEach((codes, kind) => {
      for (const code of codes) {
        ctx.scene.input.keyboard!.addKey(code).on("down", () => {
          if (ctx.interactions.enabled) ctx.room.send("emote", { kind });
        });
      }
    });
    ctx.room.onMessage("emote", (msg: EmoteBroadcast) => {
      ctx.characterOf(msg.sessionId)?.showEmote(msg.kind);
    });
  }
}
