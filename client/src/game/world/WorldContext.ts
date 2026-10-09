import type * as Phaser from "phaser";
import type { CollisionGrid } from "../../../../shared/map/collision";
import type { PlayerState } from "../../../../server/src/rooms/schema/PlayerState";
import type { PatchRoom } from "../net/Network";
import type { Character } from "../objects/Character";
import type { Interactions } from "./Interactions";

/**
 * What the World scene hands to each activity module (world/activities/*).
 * Keeps the activities from reaching into World's internals.
 */
export interface WorldContext {
  scene: Phaser.Scene;
  room: PatchRoom;
  collision: CollisionGrid;
  interactions: Interactions;
  /** Your own synced player state (undefined for a moment while joining). */
  me(): PlayerState | undefined;
  /** The drawn character for a sessionId (yours or your friend's). */
  characterOf(sessionId: string): Character | undefined;
  /** Short message at the top of the screen. */
  toast(text: string): void;
  /** Open/close a menu: disables walking and the E prompt while open. */
  setUiOpen(open: boolean): void;
  /** Current camera zoom (for crisp text). */
  zoom(): number;
}
