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
});
export type PlayerState = SchemaType<typeof PlayerState>;
