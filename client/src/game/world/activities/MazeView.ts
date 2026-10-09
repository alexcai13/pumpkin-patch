import { PATCH_MAP } from "../../../../../shared/map/patchMap";
import type { WorldContext } from "../WorldContext";
import { inRect } from "../Interactions";

const ENTRANCE = PATCH_MAP.mazeEntrance!;

/**
 * The corn maze ENTRANCE in the patch: E gets you in line. When everyone is
 * in line the server starts a run, and this switches you to the CornMaze
 * scene (the patch scene sleeps until you come back).
 */
export class MazeView {
  private inMaze = false;

  constructor(private ctx: WorldContext) {
    const { room } = ctx;
    ctx.interactions.add((c) => {
      const me = ctx.me();
      const here = inRect(c.faceX, c.faceY, ENTRANCE) || inRect(c.tileX, c.tileY, ENTRANCE);
      if (!me || !here || room.state.maze.phase !== "idle") return null;
      if (me.carrying) return { label: "Corn maze", use: () => ctx.toast("Put down what you're carrying first!") };
      if (me.mazeReady) return { label: "Leave the line", use: () => room.send("maze:cancel") };
      return { label: "Enter the corn maze", use: () => room.send("maze:enter") };
    });
  }

  update() {
    const room = this.ctx.room;
    const mine = room.state.maze.phase !== "idle" && room.state.maze.players.has(room.sessionId);
    if (mine && !this.inMaze) {
      this.inMaze = true;
      this.ctx.setUiOpen(true);
      const world = this.ctx.scene.scene;
      world.launch("CornMaze", {
        onExit: () => {
          this.inMaze = false;
          this.ctx.setUiOpen(false);
          world.wake("World");
        },
      });
      world.sleep("World");
    }
    // While waiting in line, a gentle reminder.
    const me = this.ctx.me();
    if (me?.mazeReady && !this.reminded) {
      this.reminded = true;
      this.ctx.toast("You're in line for the corn maze. Waiting for your friend to press E at the arch…");
    }
    if (!me?.mazeReady) this.reminded = false;
  }

  private reminded = false;
}
