import * as Phaser from "phaser";
import { Callbacks } from "@colyseus/sdk";
import { TILE, CARVE_W, CARVE_H } from "../../../../../shared/constants";
import { PATCH_MAP } from "../../../../../shared/map/patchMap";
import { decodeCarving } from "../../../../../shared/carving";
import type { CarvingState } from "../../../../../server/src/rooms/schema/ActivityState";
import { drawCarvedPumpkin } from "../../art/props";
import type { WorldContext } from "../WorldContext";
import { inRect } from "../Interactions";

const TABLES = PATCH_MAP.props.filter((p) => p.type === "carvingTable");
const SPOTS = PATCH_MAP.porchSpots ?? [];

/**
 * In-world side of the CARVING STATION:
 *  - E at a carving table opens the Carving scene (the drawing overlay).
 *  - Every finished carving (from either player) sits glowing on the porch.
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
      scene.textures.addCanvas(key, drawCarvedPumpkin(decodeCarving(c.mask), CARVE_W, CARVE_H));
    }
    const x = spot.x * TILE + TILE / 2;
    const y = (spot.y + 1) * TILE - 1;
    const depth = spot.y * TILE + 2; // just behind anyone standing on the porch row

    // Warm glow behind it (additive blending = it brightens what's underneath).
    const glow = scene.add.image(x, y - 7, "glow").setBlendMode(Phaser.BlendModes.ADD).setDepth(depth - 0.01).setAlpha(0.55);
    scene.tweens.add({ targets: glow, alpha: 0.85, scale: 1.08, duration: 900 + Math.random() * 400, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    const img = scene.add.image(x, y, key).setOrigin(0.5, 1).setDepth(depth);

    // Plop onto the porch.
    img.setScale(1.3, 0.6);
    scene.tweens.add({ targets: img, scaleX: 1, scaleY: 1, duration: 400, ease: "Back.easeOut" });
    this.shown.set(c.id, [glow, img]);

    if (this.ready) {
      this.ctx.toast(`${c.owner}'s jack-o'-lantern is glowing on the porch!`);
    }
  }
}
