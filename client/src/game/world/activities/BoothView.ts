import { PATCH_MAP } from "../../../../../shared/map/patchMap";
import type { WorldContext } from "../WorldContext";

const BOOTH = PATCH_MAP.props.find((p) => p.id === "photoBooth")!;
/** The open tiles inside the frame (middle column, two bottom rows). */
const INSIDE = [{ x: BOOTH.x + 1, y: BOOTH.y + 1 }, { x: BOOTH.x + 1, y: BOOTH.y + 2 }];

/** E inside (or facing into) the photo booth opens the PhotoBooth screen. */
export class BoothView {
  constructor(ctx: WorldContext) {
    ctx.interactions.add((c) => {
      const me = ctx.me();
      if (!me || me.carrying) return null;
      const here = INSIDE.some((t) => (t.x === c.tileX && t.y === c.tileY) || (t.x === c.faceX && t.y === c.faceY));
      if (!here) return null;
      return {
        label: "Use the photo booth",
        use: () => {
          ctx.setUiOpen(true);
          ctx.scene.scene.launch("PhotoBooth", { onClose: () => ctx.setUiOpen(false) });
        },
      };
    });
  }
}
