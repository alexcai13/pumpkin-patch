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

// ---------------------------------------------------------------- activities

/** Emotes on number keys 1-4. The index is what gets sent over the network. */
export const EMOTES = ["heart", "laugh", "wave", "exclaim"] as const;

/** Pumpkin picking race tuning. */
export const RACE = {
  countdownSeconds: 3,
  durationSeconds: 60,
  resultsSeconds: 8,
  smallPumpkins: 18,
  bigPumpkins: 6,
  smallPoints: 1,
  bigPoints: 3,
  /** Carrying a big pumpkin makes each step take this many times longer. */
  bigSlowdown: 1.7,
};

/** Hayride wagon speed in pixels per second, and how long it waits at stations. */
export const HAYRIDE = {
  speed: 52,
  stopSeconds: 6,
  departDelaySeconds: 2,
  /** Where the two riders sit, relative to the wagon center (pixels). */
  seats: [{ x: -11, y: -9 }, { x: 11, y: -9 }],
};

/** Carving canvas size (pixels of the carving grid). */
export const CARVE_W = 32;
export const CARVE_H = 24;

/** Tickets earned from activities (spent at the prize stand in Batch C). */
export const TICKETS = {
  giantPumpkin: 15,
  scarecrow: 6,
  maze: 10,
  raceWin: 6,
  minigameWin: 6,
  played: 2,
};

/** Scarecrow parts you can find and carry (they use PlayerState.carrying). */
export const SCARECROW_PARTS = ["hat", "shirt", "stuffing"] as const;
export type ScarecrowPart = (typeof SCARECROW_PARTS)[number];
export const PART_NAMES: Record<ScarecrowPart, string> = { hat: "straw hat", shirt: "flannel shirt", stuffing: "bundle of straw" };

/** Minigames: one at a time per room. */
export const MINIGAMES = {
  bowling: { name: "Pumpkin Bowling", turns: 3 },
  apples: { name: "Apple Bobbing", target: 5 },
  toss: { name: "Hay Bale Toss", turns: 3 },
} as const;
export type MinigameId = keyof typeof MINIGAMES;

/** Photo booth: how the shoot is timed. */
export const BOOTH = {
  shots: 3,
  countdownSeconds: 3,
  /** Pause after each photo before the next countdown. */
  pauseMs: 1200,
};
