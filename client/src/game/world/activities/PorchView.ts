import * as Phaser from "phaser";
import { Callbacks } from "@colyseus/sdk";
import { TILE, CARVE_W, CARVE_H } from "../../../../../shared/constants";
import { PATCH_MAP } from "../../../../../shared/map/patchMap";
import { decodeCarving } from "../../../../../shared/carving";
import type { CarvingState } from "../../../../../server/src/rooms/schema/ActivityState";
import { drawCarvedPumpkin, PUMPKIN_PALETTES } from "../../art/props";
import type { WorldContext } from "../WorldContext";
import { inRect } from "../Interactions";

const TABLES = PATCH_MAP.props.filter((p) => p.type === "carvingTable");
const SPOTS = PATCH_MAP.porchSpots ?? [];

/**
 * In-world side of the CARVING STATION:
 *  - E at a carving table opens the Carving scene (the drawing overlay).
 *  - Every finished carving (from either player) sits glowing on the porch.
 *  - E on a porch pumpkin opens the CarvingViewer scene to see it up close.
 */
export class PorchView {
  private shown = new Map<string, Phaser.GameObjects.GameObject[]>();
  /** Carvings that already existed when we joined shouldn't each pop a toast. */
  private ready = false;

  constructor(private ctx: WorldContext) {
    const { scene, room } = ctx;
    const callbacks = Callbacks.get(room);
    scene.time.delayedCall(1500, () => { this.ready = true; });

    callbacks.onAdd("carvings", (c: CarvingState) => this.place(c));
    callbacks.onRemove("carvings", (c: CarvingState) => {
      this.shown.get(c.id)?.forEach((o) => o.destroy());
      this.shown.delete(c.id);
    });

    // Look at a finished jack-o'-lantern (facing it or standing on its spot).
    ctx.interactions.add((c) => {
      const carvings = [...room.state.carvings];
      const index = carvings.findIndex((cv) => {
        const spot = SPOTS[cv.spot];
        return spot && ((c.faceX === spot.x && c.faceY === spot.y) || (c.tileX === spot.x && c.tileY === spot.y));
      });
      if (index === -1) return null;
      return {
        label: `Look at ${carvings[index].owner}'s pumpkin`,
        use: () => {
          ctx.setUiOpen(true);
          scene.scene.launch("CarvingViewer", { index, onClose: () => ctx.setUiOpen(false) });
        },
      };
    });

    ctx.interactions.add((c) => {
      const me = ctx.me();
      if (!me || me.carrying) return null;
      if (TABLES.some((t) => inRect(c.faceX, c.faceY, t))) {
        return {
          label: "Carve a pumpkin",
          use: () => {
            ctx.setUiOpen(true);
            scene.scene.launch("Carving", { onClose: () => ctx.setUiOpen(false) });
          },
        };
      }
      return null;
    });
  }

  private place(c: CarvingState) {
    const spot = SPOTS[c.spot];
    if (!spot) return;
    const scene = this.ctx.scene;

    // Each carving gets its own little texture made from its pixels.
    const key = `carving_${c.id}`;
    if (!scene.textures.exists(key)) {
      scene.textures.addCanvas(key, drawCarvedPumpkin(decodeCarving(c.mask), CARVE_W, CARVE_H, PUMPKIN_PALETTES[c.pumpkinColor]));
    }
    const x = spot.x * TILE + TILE / 2;
    const y = (spot.y + 1) * TILE - 1;
    const depth = spot.y * TILE + 2; // just behind anyone standing on the porch row

    // It glows once dusk falls (see world/DayCycle.ts).
    this.ctx.addGlow(x, y - 7, 1.1);
    const img = scene.add.image(x, y, key).setOrigin(0.5, 1).setDepth(depth);

    // Plop onto the porch.
    img.setScale(1.3, 0.6);
    scene.tweens.add({ targets: img, scaleX: 1, scaleY: 1, duration: 400, ease: "Back.easeOut" });
    this.shown.set(c.id, [img]);

    if (this.ready) {
      this.ctx.toast(`${c.owner}'s jack-o'-lantern is glowing on the porch!`);
    }
  }
}
