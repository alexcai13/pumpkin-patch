import { schema, t, type SchemaType } from "@colyseus/schema";
import { PlayerState } from "./PlayerState.js";
import {
  PumpkinState, RaceState, CarvingState, HayrideState, BoothState,
  GiantPumpkinState, ScarecrowState, MazeState, MinigameState, FarmerState, CrowState, NotesState,
} from "./ActivityState.js";

/**
 * The whole shared state of one pumpkin patch room. The server owns it; clients
 * only ever read it.
 */
export const PatchState = schema({
  /** Players keyed by their Colyseus sessionId. */
  players: t.map(PlayerState),

  /** Field pumpkins keyed by id. */
  pumpkins: t.map(PumpkinState),
  race: RaceState,

  /** Carved pumpkins on the porch (they stay for the whole session). */
  carvings: t.array(CarvingState),

  hayride: HayrideState,

  booth: BoothState,

  giant: GiantPumpkinState,
  scarecrow: ScarecrowState,
  maze: MazeState,
  minigame: MinigameState,

  farmer: FarmerState,
  crow: CrowState,
  notes: NotesState,

  /** Server clock (ms) when the room opened — drives the shared day/dusk cycle. */
  startedAt: t.float64(),
});
export type PatchState = SchemaType<typeof PatchState>;
