import { schema, t, type SchemaType } from "@colyseus/schema";
import { PlayerState } from "./PlayerState.js";

/**
 * The whole shared state of one pumpkin patch room. The server owns it; clients
 * only ever read it. Later phases add pumpkins, scores, minigames, etc. here.
 */
export const PatchState = schema({
  /** Players keyed by their Colyseus sessionId. */
  players: t.map(PlayerState),
});
export type PatchState = SchemaType<typeof PatchState>;
