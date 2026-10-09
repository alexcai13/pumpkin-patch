import * as Phaser from "phaser";
import { Callbacks } from "@colyseus/sdk";
import { TILE, PART_NAMES, SCARECROW_PARTS, type ScarecrowPart } from "../../../../../shared/constants";
import { PATCH_MAP } from "../../../../../shared/map/patchMap";
import type { ScarecrowPartState } from "../../../../../server/src/rooms/schema/ActivityState";
import { drawScarecrow } from "../../art/props";
import type { WorldContext } from "../WorldContext";

const POST = PATCH_MAP.props.find((p) => p.id === "scarecrowPost")!;
const isPart = (k: string): k is ScarecrowPart => (SCARECROW_PARTS as readonly string[]).includes(k);

/**
 * In-world side of SCARECROW BUILDING: shows the hidden parts (small, with a
 * twinkle so they can be spotted), lets you pick them up and add them to the
 * post, and redraws the scarecrow as parts go on.
 */
export class ScarecrowView {
  private partSprites = new Map<string, Phaser.GameObjects.GameObject[]>();
  private shownMask = -1;

  constructor(private ctx: WorldContext) {
    const { scene, room } = ctx;
    const s = room.state.scarecrow;
    const cb = Callbacks.get(room);

    cb.onAdd(s, "parts", (part: ScarecrowPartState, kind: string) => {
      const x = part.tx * TILE + TILE / 2, y = (part.ty + 1) * TILE - 2;
      const img = scene.add.image(x, y, `part_${kind}`).setOrigin(0.5, 1).setDepth(part.ty * TILE + 4);
      const sparkle = scene.add.image(x + 5, y - 10, "sparkle").setDepth(part.ty * TILE + 5);
      scene.tweens.add({ targets: sparkle, alpha: 0.1, scale: 0.4, duration: 700, yoyo: true, repeat: -1, delay: Math.random() * 700 });
      this.partSprites.set(kind, [img, sparkle]);
    });
    cb.onRemove(s, "parts", (_p: ScarecrowPartState, kind: string) => {
      this.partSprites.get(kind)?.forEach((o) => o.destroy());
      this.partSprites.delete(kind);
    });

    // Pick up a part you're facing or standing on.
    ctx.interactions.add((c) => {
      const me = ctx.me();
      if (!me || me.carrying) return null;
      for (const part of s.parts.values()) {
        const here = (c.faceX === part.tx && c.faceY === part.ty) || (c.tileX === part.tx && c.tileY === part.ty);
        if (here) {
          return { label: `Pick up the ${PART_NAMES[part.kind as ScarecrowPart]}`, use: () => room.send("scarecrow:pick", { kind: part.kind }) };
        }
      }
      return null;
    });

    // The post: add what you're carrying, or get a hint.
    ctx.interactions.add((c) => {
      if (c.faceX !== POST.x || c.faceY !== POST.y) return null;
      const me = ctx.me();
      if (s.built) return { label: "Admire the scarecrow", use: () => ctx.toast("Looking sharp! 🌾") };
      if (me && isPart(me.carrying)) {
        return { label: `Add the ${PART_NAMES[me.carrying]}`, use: () => room.send("scarecrow:place") };
      }
      const missing = SCARECROW_PARTS.filter((k) => !s[k]).map((k) => PART_NAMES[k]);
      return { label: "Scarecrow post", use: () => ctx.toast(`Still missing: ${missing.join(", ")}. Look for twinkles around the patch!`) };
    });
  }

  update() {
    const s = this.ctx.room.state.scarecrow;
    const mask = (s.hat ? 1 : 0) | (s.shirt ? 2 : 0) | (s.stuffing ? 4 : 0);
    if (mask === this.shownMask) return;
    const first = this.shownMask === -1;
    this.shownMask = mask;
    const img = this.ctx.propImage("scarecrowPost");
    if (!img) return;
    const key = `scarecrow_${mask}`;
    if (!this.ctx.scene.textures.exists(key)) this.ctx.scene.textures.addCanvas(key, drawScarecrow(s.hat, s.shirt, s.stuffing));
    // The scarecrow canvas is 8px wider and 4px taller than the plain post.
    img.setTexture(key).setOrigin(0, 1);
    img.setPosition(POST.x * TILE - 4, (POST.y + 1) * TILE);
    if (!first) {
      img.setScale(1.15, 0.85);
      this.ctx.scene.tweens.add({ targets: img, scaleX: 1, scaleY: 1, duration: 350, ease: "Back.easeOut" });
    }
  }
}
