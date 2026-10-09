import { MINIGAMES, type MinigameId } from "../../../../../shared/constants";
import { PATCH_MAP } from "../../../../../shared/map/patchMap";
import type { WorldContext } from "../WorldContext";
import { inRect } from "../Interactions";

const STATIONS = PATCH_MAP.stations!;
/** Which Phaser scene runs each minigame. */
export const MINIGAME_SCENES: Record<MinigameId, string> = { bowling: "Bowling", apples: "AppleBobbing", toss: "HayToss" };

/**
 * The minigame STATIONS in the patch (bowling lane, apple barrel, toss
 * strip): E opens a game (or joins the one your friend opened) and launches
 * that game's scene on top of the patch.
 */
export class MinigameView {
  constructor(private ctx: WorldContext) {
    const { room } = ctx;
    ctx.interactions.add((c) => {
      const me = ctx.me();
      if (!me || me.carrying) return null;
      const game = (Object.keys(STATIONS) as MinigameId[]).find(
        (g) => inRect(c.faceX, c.faceY, STATIONS[g]) || inRect(c.tileX, c.tileY, STATIONS[g]),
      );
      if (!game) return null;
      const mg = room.state.minigame;
      const name = MINIGAMES[game].name;
      if (mg.game === "") return { label: `Play ${name}`, use: () => { room.send("mg:open", { game }); this.open(game); } };
      if (mg.game !== game) {
        return { label: name, use: () => ctx.toast(`Someone's playing ${MINIGAMES[mg.game as MinigameId].name} right now — join them or wait!`) };
      }
      if (mg.players.includes(room.sessionId)) return { label: `Back to ${name}`, use: () => this.open(game) };
      if (mg.players.length >= 2) return { label: name, use: () => ctx.toast("That game is full.") };
      if (mg.phase === "playing") return { label: name, use: () => ctx.toast("A game is in progress — wait for the next round!") };
      return { label: `Join ${name}`, use: () => { room.send("mg:join"); this.open(game); } };
    });
  }

  private open(game: MinigameId) {
    this.ctx.setUiOpen(true);
    this.ctx.scene.scene.launch(MINIGAME_SCENES[game], { onClose: () => this.ctx.setUiOpen(false) });
  }
}
