import type { PatchRoom } from "../PatchRoom.js";
import { CrowState } from "../schema/ActivityState.js";
import { TILE } from "../../../../shared/constants.js";

/** Seconds between crow visits (random in this range). The first comes sooner. */
const VISIT_EVERY = [70, 130];
const FIRST_VISIT = 40;
/** Speeds in px/s: flying in, hopping around, scared, flying off. */
const SPEED = { fly: 110, hop: 42, scared: 88, leave: 160 };
/** How long it stays before escaping with the pumpkin (s). */
const ESCAPE_AFTER = 45;
/** Get this close (tiles) to catch it; within SCARE_RANGE it runs. */
const CATCH_RANGE = 0.9;
const SCARE_RANGE = 2.6;
const CATCH_REWARD = 4;

/**
 * THE CROW (world event)
 * Every so often a crow flies in, grabs a pumpkin from the field and hops
 * around the patch with it. Run into it to make it drop the pumpkin (it
 * flees when you get close — team up to corner it!). If nobody catches it
 * in time, it flies off with the pumpkin. Movement is simulated here 20x/s.
 */
export class Crow {
  private waitLeft = FIRST_VISIT;
  private fleeLeft = 0;
  private targetId = "";
  private wander = { x: 0, y: 0 };

  constructor(private room: PatchRoom, private onCaught: () => void) {
    room.state.crow = new CrowState();
  }

  private get c() { return this.room.state.crow; }
  private get mapW() { return this.room.collision.width * TILE; }
  private get mapH() { return this.room.collision.height * TILE; }

  update(dtMs: number) {
    const dt = dtMs / 1000;
    const c = this.c;
    switch (c.phase) {
      case "gone": {
        this.waitLeft -= dt;
        // No crow during the picking race (too chaotic) or if nobody's around.
        if (this.waitLeft > 0 || this.room.state.race.phase !== "idle" || this.room.state.players.size === 0) return;
        const targets = [...this.room.state.pumpkins.values()].filter((p) => !p.picked);
        if (targets.length === 0) { this.waitLeft = 20; return; }
        const t = targets[Math.floor(Math.random() * targets.length)];
        this.targetId = t.id;
        c.x = Math.random() * this.mapW;
        c.y = -20;
        c.carrying = false;
        c.phase = "flyingIn";
        return;
      }
      case "flyingIn": {
        const t = this.room.state.pumpkins.get(this.targetId);
        if (!t || t.picked) { c.phase = "leaving"; return; }
        if (this.moveToward(t.tx * TILE + 8, t.ty * TILE + 4, SPEED.fly, dt)) {
          t.picked = true; // the pumpkin disappears from the field
          c.carrying = true;
          c.phase = "fleeing";
          this.fleeLeft = ESCAPE_AFTER;
          this.pickWander();
          this.room.broadcast("crow", { event: "stole" });
          this.room.broadcast("toast", { text: "🐦‍⬛ A crow stole a pumpkin! Chase it down!" });
        }
        return;
      }
      case "fleeing": {
        this.fleeLeft -= dt;
        if (this.fleeLeft <= 0) { this.escape(); return; }
        // Nearest player: caught, scared, or calm?
        let nearest: { d: number; x: number; y: number; id: string } | null = null;
        for (const [id, p] of this.room.state.players) {
          if (!p.connected || this.room.isBusy(p, id)) continue;
          const d = Math.hypot(p.x - c.x, p.y - c.y) / TILE;
          if (!nearest || d < nearest.d) nearest = { d, x: p.x, y: p.y, id };
        }
        if (nearest && nearest.d <= CATCH_RANGE) { this.caught(nearest.id); return; }
        if (nearest && nearest.d <= SCARE_RANGE) {
          // Run directly away (with a little sideways wiggle).
          const ang = Math.atan2(c.y - nearest.y, c.x - nearest.x) + (Math.random() - 0.5) * 0.6;
          this.wander = this.clamp(c.x + Math.cos(ang) * 60, c.y + Math.sin(ang) * 60);
          this.moveToward(this.wander.x, this.wander.y, SPEED.scared, dt);
          return;
        }
        if (this.moveToward(this.wander.x, this.wander.y, SPEED.hop, dt)) this.pickWander();
        return;
      }
      case "leaving": {
        if (this.moveToward(c.x + (c.facingLeft ? -400 : 400), -60, SPEED.leave, dt) || c.y < -40) {
          c.phase = "gone";
          c.carrying = false;
          this.waitLeft = VISIT_EVERY[0] + Math.random() * (VISIT_EVERY[1] - VISIT_EVERY[0]);
        }
        return;
      }
    }
  }

  /** Step toward a point; returns true when it got there. */
  private moveToward(x: number, y: number, speed: number, dt: number) {
    const c = this.c;
    const dx = x - c.x, dy = y - c.y;
    const dist = Math.hypot(dx, dy);
    if (Math.abs(dx) > 1) c.facingLeft = dx < 0;
    if (dist <= speed * dt) { c.x = x; c.y = y; return true; }
    c.x += (dx / dist) * speed * dt;
    c.y += (dy / dist) * speed * dt;
    return false;
  }

  /** Somewhere nearby (but on the map) to hop to next. */
  private pickWander() {
    const c = this.c;
    this.wander = this.clamp(c.x + (Math.random() - 0.5) * 160, c.y + (Math.random() - 0.5) * 120);
  }

  /** Keep it inside the patch (not in the border trees). */
  private clamp(x: number, y: number) {
    return {
      x: Math.max(TILE * 3, Math.min(this.mapW - TILE * 3, x)),
      y: Math.max(TILE * 3, Math.min(this.mapH - TILE * 3, y)),
    };
  }

  private caught(sessionId: string) {
    const c = this.c;
    const pumpkin = this.room.state.pumpkins.get(this.targetId);
    if (pumpkin) pumpkin.picked = false; // it pops back into the field
    c.carrying = false;
    c.phase = "leaving";
    const name = this.room.state.players.get(sessionId)?.name ?? "Someone";
    this.room.awardTickets([sessionId], CATCH_REWARD);
    this.room.broadcast("crow", { event: "caught" });
    this.room.broadcast("toast", { text: `${name} scared off the crow and saved the pumpkin! +${CATCH_REWARD} tickets` });
    this.onCaught();
  }

  private escape() {
    this.c.phase = "leaving";
    this.room.broadcast("toast", { text: "The crow got away with the pumpkin… it'll be back!" });
    // The stolen pumpkin regrows later.
    const id = this.targetId;
    this.room.clock.setTimeout(() => { const p = this.room.state.pumpkins.get(id); if (p) p.picked = false; }, 30_000);
  }
}
