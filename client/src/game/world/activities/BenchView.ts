import { PATCH_MAP } from "../../../../../shared/map/patchMap";
import type { WorldContext } from "../WorldContext";
import { inRect } from "../Interactions";

const BENCHES = PATCH_MAP.props.filter((p) => p.type === "bench");

/**
 * In-world side of the CIDER STAND: sit on a bench with E (E again, or any
 * arrow key, to stand). When you're sitting and your friend is too (or you're
 * alone in the room), it gets cozy: the camera eases in and extra leaves
 * blow past (scene "CiderCozy"). No goal — just hang out.
 */
export class BenchView {
  private cozy = false;
  private standRequested = 0;

  constructor(private ctx: WorldContext, private setCozyZoom: (cozy: boolean) => void) {
    // Sitting takes priority over everything else.
    ctx.interactions.addFirst(() => {
      const me = ctx.me();
      if (!me?.seat) return null;
      return { label: "Stand up", use: () => this.stand() };
    });
    ctx.interactions.add((c) => {
      const me = ctx.me();
      if (!me || me.carrying || me.riding >= 0) return null;
      const bench = BENCHES.find((b) => inRect(c.faceX, c.faceY, b));
      if (!bench) return null;
      return { label: "Sit down", use: () => ctx.room.send("bench:sit", { bench: bench.id }) };
    });
  }

  /** Arrow keys while seated also stand you up (rate-limited). */
  stand() {
    const now = performance.now();
    if (now - this.standRequested < 500) return;
    this.standRequested = now;
    this.ctx.room.send("bench:stand");
  }

  update() {
    const players = [...this.ctx.room.state.players.values()];
    const me = this.ctx.me();
    const shouldBeCozy = !!me?.seat && players.every((p) => p.seat || !p.connected);
    if (shouldBeCozy === this.cozy) return;
    this.cozy = shouldBeCozy;
    const scenes = this.ctx.scene.scene;
    if (shouldBeCozy) {
      scenes.launch("CiderCozy");
      if (players.length > 1) this.ctx.toast("Cider and good company. 🍂");
    } else {
      scenes.stop("CiderCozy");
    }
    this.setCozyZoom(shouldBeCozy);
  }
}
