import * as Phaser from "phaser";
import { PATCH_MAP } from "../../../../../shared/map/patchMap";
import { FARMER_TASKS, FARMER_NAME } from "../../../../../shared/tasks";
import type { WorldContext } from "../WorldContext";
import { inRect } from "../Interactions";
import { OVERLAY_DEPTH } from "../../objects/Character";

const FARMER = PATCH_MAP.props.find((p) => p.id === "farmer")!;

/**
 * FARMER HOLLIS: talk (E) to hear the current task and its progress, or hand
 * over a pumpkin for the pumpkin task. A "!" floats over him while a task is
 * waiting. (Rules: server/src/rooms/activities/Farmer.ts)
 */
export class FarmerView {
  private bubble: Phaser.GameObjects.Image;

  constructor(private ctx: WorldContext) {
    const { scene, room } = ctx;
    const img = ctx.propImage("farmer");
    // A gentle idle bob so he looks alive.
    if (img) scene.tweens.add({ targets: img, scaleY: 1.04, duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    this.bubble = scene.add.image(FARMER.x * 16 + 8, FARMER.y * 16 - 20, "emote_exclaim").setOrigin(0.5, 1).setDepth(OVERLAY_DEPTH - 2);
    scene.tweens.add({ targets: this.bubble, y: this.bubble.y - 3, duration: 600, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });

    ctx.interactions.add((c) => {
      if (!inRect(c.faceX, c.faceY, FARMER)) return null;
      const f = room.state.farmer;
      const me = ctx.me();
      const pumpkin = me && (me.carrying === "small" || me.carrying === "big");
      if (f.taskId === "pumpkins" && pumpkin && room.state.race.phase === "idle") {
        return { label: `Give pumpkin (${f.progress}/${f.goal})`, use: () => room.send("farmer:give") };
      }
      return { label: `Talk to ${FARMER_NAME}`, use: () => ctx.toast(this.taskLine()) };
    });
  }

  /** What the farmer says about the current task. */
  taskLine() {
    const f = this.ctx.room.state.farmer;
    const task = FARMER_TASKS.find((t) => t.id === f.taskId);
    if (!task) return `${FARMER_NAME}: "Thanks again, friends! Give me a moment to think…"`;
    const progress = task.goal > 1 ? ` (${f.progress}/${f.goal})` : "";
    return `${FARMER_NAME}: "${task.text}"${progress} — reward: ${task.reward} tickets each`;
  }

  update() {
    this.bubble.setVisible(!!this.ctx.room.state.farmer.taskId);
  }
}
