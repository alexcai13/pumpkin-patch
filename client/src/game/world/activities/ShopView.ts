import { PATCH_MAP } from "../../../../../shared/map/patchMap";
import type { WorldContext } from "../WorldContext";
import { inRect } from "../Interactions";

const STAND = PATCH_MAP.props.find((p) => p.id === "prizeStand")!;

/** E at the ticket/prize stand opens the PrizeShop screen. */
export class ShopView {
  constructor(ctx: WorldContext) {
    ctx.interactions.add((c) => {
      if (!inRect(c.faceX, c.faceY, STAND)) return null;
      return {
        label: "Tickets & Prizes",
        use: () => {
          ctx.setUiOpen(true);
          ctx.scene.scene.launch("PrizeShop", { onClose: () => ctx.setUiOpen(false) });
        },
      };
    });
  }
}
