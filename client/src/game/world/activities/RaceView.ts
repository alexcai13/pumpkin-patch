import * as Phaser from "phaser";
import { Callbacks } from "@colyseus/sdk";
import { TILE, RACE } from "../../../../../shared/constants";
import { PATCH_MAP } from "../../../../../shared/map/patchMap";
import type { PumpkinState } from "../../../../../server/src/rooms/schema/ActivityState";
import type { WorldContext } from "../WorldContext";
import { FONT } from "../../ui/fonts";
import { OVERLAY_DEPTH } from "../../objects/Character";

const FIELD_SIGN = PATCH_MAP.props.find((p) => p.id === "signField")!;
const BASKETS = [0, 1].map((slot) => PATCH_MAP.props.find((p) => p.id === `basket${slot}`)!);

/**
 * In-world side of the PUMPKIN PICKING RACE: draws field pumpkins and basket
 * name labels, and offers the E actions (start / pick / deliver).
 * The timer + scoreboard are in the RaceHud scene. Rules live on the server
 * (server/src/rooms/activities/PickingRace.ts).
 */
export class RaceView {
  private sprites = new Map<string, Phaser.GameObjects.Image>();
  private basketLabels: Phaser.GameObjects.Text[] = [];
  private lastPhase = "idle";

  constructor(private ctx: WorldContext) {
    const { scene, room } = ctx;
    const callbacks = Callbacks.get(room);

    callbacks.onAdd("pumpkins", (p: PumpkinState, id: string) => {
      const img = scene.add.image(p.tx * TILE + TILE / 2, (p.ty + 1) * TILE + (p.big ? 1 : 0), p.big ? "pumpkin_big" : "pumpkin")
        .setOrigin(0.5, 1)
        .setDepth(p.ty * TILE + TILE / 2 - 0.2)
        .setVisible(!p.picked);
      this.sprites.set(id, img);
      // A freshly grown pumpkin pops up out of the soil.
      img.setScale(0.2, 0);
      scene.tweens.add({ targets: img, scaleX: 1, scaleY: 1, duration: 350, delay: Math.random() * 400, ease: "Back.easeOut" });
      callbacks.listen(p, "picked", (picked: boolean) => img.setVisible(!picked));
    });
    callbacks.onRemove("pumpkins", (_p: PumpkinState, id: string) => {
      this.sprites.get(id)?.destroy();
      this.sprites.delete(id);
    });

    // Name labels over each basket ("Alex's basket").
    for (const b of BASKETS) {
      this.basketLabels.push(scene.add.text(b.x * TILE + TILE / 2, b.y * TILE - 3, "", {
        fontFamily: FONT, fontSize: "7px", color: "#ffe08a", stroke: "#2a1a14", strokeThickness: 3,
      }).setOrigin(0.5, 1).setDepth(OVERLAY_DEPTH - 1));
    }

    ctx.interactions.add((c) => this.interaction(c));
  }

  private get race() { return this.ctx.room.state.race; }

  private ownerOf(slot: number) {
    for (const p of this.ctx.room.state.players.values()) if (p.slot === slot) return p;
    return undefined;
  }

  private interaction(c: { tileX: number; tileY: number; faceX: number; faceY: number }) {
    const me = this.ctx.me();
    if (!me) return null;
    const faces = (x: number, y: number) => (c.faceX === x && c.faceY === y);
    const room = this.ctx.room;

    // Field sign: start a race.
    if (faces(FIELD_SIGN.x, FIELD_SIGN.y)) {
      if (this.race.phase === "idle") return { label: "Start pumpkin race!", use: () => room.send("race:start") };
      return null;
    }
    if (this.race.phase !== "running") {
      if (BASKETS.some((b) => faces(b.x, b.y))) return { label: "Read basket", use: () => this.ctx.toast("Race baskets! Start a race at the Pumpkin Field sign.") };
      return null;
    }

    // Deliver to your own basket.
    const mine = BASKETS[me.slot];
    if (faces(mine.x, mine.y) && me.carrying) {
      const pts = me.carrying === "big" ? RACE.bigPoints : RACE.smallPoints;
      return { label: `Drop in basket (+${pts})`, use: () => room.send("race:deliver") };
    }
    const other = BASKETS[1 - me.slot];
    if (faces(other.x, other.y)) {
      return { label: "Not your basket!", use: () => this.ctx.toast(`That's ${this.ownerOf(1 - me.slot)?.name ?? "your friend"}'s basket — yours is the other one.`) };
    }

    // Pick up a pumpkin you're facing or standing on.
    if (!me.carrying) {
      for (const p of room.state.pumpkins.values()) {
        if (p.picked) continue;
        if (faces(p.tx, p.ty) || (c.tileX === p.tx && c.tileY === p.ty)) {
          return {
            label: p.big ? `Pick big pumpkin (${RACE.bigPoints} pts, heavy!)` : `Pick pumpkin (${RACE.smallPoints} pt)`,
            use: () => room.send("race:pick", { id: p.id }),
          };
        }
      }
    }
    return null;
  }

  update() {
    // Basket labels follow whoever owns each slot.
    BASKETS.forEach((_, slot) => {
      const owner = this.ownerOf(slot);
      this.basketLabels[slot].setText(owner ? `${owner.name}'s basket` : "");
    });

    // Starting a race opens the race HUD; it closes itself after results.
    const phase = this.race.phase;
    if (phase !== this.lastPhase) {
      if (this.lastPhase === "idle" && phase !== "idle") {
        this.ctx.scene.scene.launch("RaceHud");
      }
      this.lastPhase = phase;
    }
  }

  setTextResolution(zoom: number) {
    this.basketLabels.forEach((l) => l.setResolution(zoom));
  }
}
