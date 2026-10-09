import { schema, t, type SchemaType } from "@colyseus/schema";

/**
 * One player in the patch. Every field here is synced automatically to both
 * clients whenever it changes on the server.
 *
 * Positions are in world pixels (not tiles). Each client moves its own
 * character and reports its position; the server stores it here so the other
 * client can draw it.
 */
export const PlayerState = schema({
  name: t.string(),
  /** Index into PLAYER_COLORS (shared/constants.ts). */
  color: t.uint8(),

  x: t.float32(),
  y: t.float32(),
  /** Facing direction, see Dir in shared/constants.ts. */
  dir: t.uint8(),
  moving: t.boolean(),
  running: t.boolean(),

  /**
   * False while the player's connection has dropped and the server is holding
   * their seat in case they come back (see PatchRoom.onDrop). Clients draw
   * them faded out meanwhile.
   */
  connected: t.boolean().default(true),

  /** 0 or 1: which player this is in the room (decides spawn + race basket). */
  slot: t.uint8(),

  /** What they're holding: "" (nothing), "small" or "big" pumpkin. */
  carrying: t.string().default(""),
  /** Points in the current/last pumpkin race. */
  raceScore: t.uint16(),

  /** Bench seat like "bench1:0" while sitting at the cider stand, else "". */
  seat: t.string().default(""),
  /** Hayride seat 0/1 while riding the wagon, -1 when not riding. */
  riding: t.int8().default(-1),
});
export type PlayerState = SchemaType<typeof PlayerState>;
