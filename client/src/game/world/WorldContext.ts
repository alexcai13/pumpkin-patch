import type * as Phaser from "phaser";
import type { CollisionGrid } from "../../../../shared/map/collision";
import type { PlayerState } from "../../../../server/src/rooms/schema/PlayerState";
import type { PatchRoom } from "../net/Network";
import type { Character } from "../objects/Character";
import type { Interactions } from "./Interactions";
import type { PlayerController } from "./PlayerController";

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
  /** Your movement controller (to see what you're pushing against, etc.). */
  controller(): PlayerController | undefined;
  /** The image drawn for a map prop (by prop id), e.g. to change its look. */
  propImage(id: string): Phaser.GameObjects.Image | undefined;
  /** Add a soft light that glows at dusk (world coords). */
  addGlow(x: number, y: number, scale?: number): void;
}
