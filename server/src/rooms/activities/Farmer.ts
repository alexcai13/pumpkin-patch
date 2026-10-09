import type { Client } from "colyseus";
import type { PatchRoom } from "../PatchRoom.js";
import { FarmerState } from "../schema/ActivityState.js";
import { PATCH_MAP } from "../../../../shared/map/patchMap.js";
import { FARMER_TASKS, FARMER_NAME } from "../../../../shared/tasks.js";

const FARMER = PATCH_MAP.props.find((p) => p.id === "farmer")!;

/**
 * FARMER HOLLIS gives one shared task at a time (shared/tasks.ts). Other
 * activities report progress with `farmer.progress(taskId)`; when the goal
 * is reached both players get the reward and a new task is picked.
 * The pumpkin task is special: you hand pumpkins to the farmer with E.
 */
export class Farmer {
  constructor(private room: PatchRoom) {
    room.state.farmer = new FarmerState();
    this.nextTask();
    room.onMessage("farmer:give", (client: Client) => this.give(client));
  }

  private get f() { return this.room.state.farmer; }

  get taskId() { return this.f.taskId; }

  private nextTask() {
    const options = FARMER_TASKS.filter((t) => t.id !== this.f.taskId);
    const task = options[Math.floor(Math.random() * options.length)];
    this.f.taskId = task.id;
    this.f.progress = 0;
    this.f.goal = task.goal;
  }

  /** Something happened that counts toward a task. */
  progress(taskId: string, amount = 1) {
    if (this.f.taskId !== taskId) return;
    this.f.progress = Math.min(this.f.goal, this.f.progress + amount);
    if (this.f.progress < this.f.goal) return;
    const task = FARMER_TASKS.find((t) => t.id === taskId)!;
    this.room.awardTickets([...this.room.state.players.keys()], task.reward);
    this.room.broadcast("toast", { text: `${FARMER_NAME}: "Thank ya kindly!" +${task.reward} tickets each 🎟` });
    this.f.completed++;
    // A moment's rest before the next request.
    this.f.taskId = "";
    this.room.clock.setTimeout(() => this.nextTask(), 4000);
  }

  /** Hand the farmer the pumpkin you're carrying (for the "pumpkins" task). */
  private give(client: Client) {
    const player = this.room.state.players.get(client.sessionId);
    if (!player || this.f.taskId !== "pumpkins") return;
    if (player.carrying !== "small" && player.carrying !== "big") return;
    if (this.room.tileDistance(player, FARMER.x, FARMER.y) > 1.6) return;
    if (this.room.state.race.phase !== "idle") return; // race pumpkins go in baskets!
    player.carrying = "";
    this.progress("pumpkins");
  }
}
