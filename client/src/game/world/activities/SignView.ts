import { PATCH_MAP } from "../../../../../shared/map/patchMap";
import type { WorldContext } from "../WorldContext";

/**
 * What each sign says when you read it (E). Signs whose area has its own
 * action (like the Pumpkin Field sign starting a race) are handled by that
 * activity first, because SignView is registered last.
 */
const SIGN_TEXT: Record<string, string> = {
  signPorch: "Carving Porch — face a table and press E to carve a jack-o'-lantern.",
  signCider: "Cider Stand — sit on a bench with your friend and enjoy the view.",
  signMaze: "Corn Maze — both stand under the arch and press E. One of you gets the map, the other can see. Find the exit together!",
  signField: "Pumpkin Field — press E here to start a race.",
  signGames: "Minigames — bowling lane, apple barrel and hay toss strip. Press E at one to play; your friend can join!",
  signHayride: "Hayride — stand next to the wagon and press E to board. It leaves when everyone's on.",
  signStopFarm: "Hayride stop — the wagon pauses here. Hop on or off!",
  signStopMaze: "Hayride stop — the wagon pauses here. Hop on or off!",
  signPrizes: "Tickets & Prizes — trade your tickets for hats and pumpkin colors!",
  signPhoto: "Photo Booth — step inside the frame and press E. Both of you on camera, 3 photos, one strip!",
};

export class SignView {
  constructor(ctx: WorldContext) {
    const readable = PATCH_MAP.props.filter((p) => SIGN_TEXT[p.id]);
    ctx.interactions.add((c) => {
      const prop = readable.find((p) => c.faceX >= p.x && c.faceX < p.x + p.w && c.faceY >= p.y && c.faceY < p.y + p.h);
      if (!prop) return null;
      return { label: "Read", use: () => ctx.toast(SIGN_TEXT[prop.id]) };
    });
  }
}
