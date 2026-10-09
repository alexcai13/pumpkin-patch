/**
 * Constants shared by the server and the client.
 *
 * This folder (`/shared`) holds plain TypeScript with NO dependencies, so both
 * `server/` and `client/` can import it. Anything both sides must agree on
 * (tile size, map layout, colors, message shapes) lives here.
 */

/** Size of one map tile in world pixels. The camera zooms this up on screen. */
export const TILE = 16;

/** A room never holds more than this many players. */
export const MAX_PLAYERS = 2;

/** How often (per second) a client sends its own position to the server. */
export const SEND_RATE_HZ = 15;

/** Milliseconds to walk one tile. Lower = faster. */
export const WALK_STEP_MS = 230;
/** Milliseconds to run one tile (hold Shift). */
export const RUN_STEP_MS = 140;

/**
 * Character color options shown on the title screen. `main` and `shade` replace
 * the clothing colors in the character sprite (a palette swap), so every option
 * gets its own crisp texture instead of a muddy tint.
 */
export const PLAYER_COLORS = [
  { name: "Pumpkin", main: "#e8762b", shade: "#b4521c" },
  { name: "Moss",    main: "#5e8c3a", shade: "#3f6327" },
  { name: "Plum",    main: "#8a4f8f", shade: "#5f3366" },
  { name: "Cranberry", main: "#c23b3b", shade: "#8a2430" },
  { name: "Goldenrod", main: "#e0b33a", shade: "#a87d22" },
  { name: "Lake",    main: "#3f7fa6", shade: "#2b5878" },
] as const;

/** Longest allowed player name. The server trims anything longer. */
export const NAME_MAX = 12;

/** Facing directions. Numbers so they pack into a single byte in the schema. */
export const Dir = { Down: 0, Left: 1, Right: 2, Up: 3 } as const;
export type Dir = (typeof Dir)[keyof typeof Dir];
