import { schema, t, type SchemaType } from "@colyseus/schema";

/**
 * Shared state for the activities in the main patch. Like everything in
 * schema/, the server writes it and both clients read it.
 */

/** One pumpkin in the field, used by the picking race. */
export const PumpkinState = schema({
  id: t.string(),
  /** Tile it grows on. */
  tx: t.uint8(),
  ty: t.uint8(),
  big: t.boolean(),
  /** True once someone picked it up; it's hidden from the field until regrowth. */
  picked: t.boolean(),
});
export type PumpkinState = SchemaType<typeof PumpkinState>;

/** The pumpkin picking race. */
export const RaceState = schema({
  /** "idle" → "countdown" → "running" → "results" → "idle" */
  phase: t.string().default("idle"),
  /** Seconds left in the current phase (countdown / race / results). */
  secondsLeft: t.uint8(),
  /** sessionId of the winner, "tie", or "" before anyone has won. */
  winner: t.string().default(""),
});
export type RaceState = SchemaType<typeof RaceState>;

/** A carved pumpkin sitting on the porch. */
export const CarvingState = schema({
  id: t.string(),
  /** Carver's name and color, so it can be labeled. */
  owner: t.string(),
  color: t.uint8(),
  /** Packed pixels, see shared/carving.ts. */
  mask: t.string(),
  /** Index into PATCH_MAP.porchSpots. */
  spot: t.uint8(),
  /** The carver's pumpkin color from the prize stand ("orange", "white", ...). */
  pumpkinColor: t.string().default("orange"),
});
export type CarvingState = SchemaType<typeof CarvingState>;

/** The hayride wagon. */
export const HayrideState = schema({
  /** Wagon center in world pixels. */
  x: t.float32(),
  y: t.float32(),
  /** "parked" (at home), "moving", or "stopped" (at a station). */
  phase: t.string().default("parked"),
  /** Station name while stopped, e.g. "Corn Maze". */
  stopName: t.string().default(""),
  /** True when driving left, so the sprite can be mirrored. */
  facingLeft: t.boolean(),
  /** Seconds until it leaves (counting down while everyone's aboard / at a stop). */
  departIn: t.uint8(),
});
export type HayrideState = SchemaType<typeof HayrideState>;

/** The photo booth's shared timer. Who's in the booth is PlayerState.inBooth. */
export const BoothState = schema({
  /** "idle" → "shooting" → "done" (strip ready) → back to "idle" on the next start */
  phase: t.string().default("idle"),
  /** Which photo is coming up (1 to BOOTH.shots) while shooting. */
  shot: t.uint8(),
  /** 3, 2, 1 before each photo; 0 at the moment it's taken. */
  countdown: t.uint8(),
});
export type BoothState = SchemaType<typeof BoothState>;

/** The giant pumpkin (2x2 tiles) both players push to the wagon. */
export const GiantPumpkinState = schema({
  /** Top-left tile. */
  tx: t.uint8(),
  ty: t.uint8(),
  /** "idle" (pushable) or "loaded" (on the wagon, about to reset). */
  phase: t.string().default("idle"),
  /** How many players are pushing it right now (for the "too heavy" hint). */
  pushers: t.uint8(),
});
export type GiantPumpkinState = SchemaType<typeof GiantPumpkinState>;

/** One scarecrow part lying somewhere in the patch, waiting to be found. */
export const ScarecrowPartState = schema({
  kind: t.string(),
  tx: t.uint8(),
  ty: t.uint8(),
});
export type ScarecrowPartState = SchemaType<typeof ScarecrowPartState>;

export const ScarecrowState = schema({
  /** Parts still lying around (keyed by kind). Carried parts are on PlayerState.carrying. */
  parts: t.map(ScarecrowPartState),
  /** Parts already put on the post. */
  hat: t.boolean(),
  shirt: t.boolean(),
  stuffing: t.boolean(),
  /** All three on: stays built for the rest of the session. */
  built: t.boolean(),
});
export type ScarecrowState = SchemaType<typeof ScarecrowState>;

/** A player's position inside the corn maze (separate from the main map). */
export const MazePlayerState = schema({
  x: t.float32(),
  y: t.float32(),
  dir: t.uint8(),
  moving: t.boolean(),
});
export type MazePlayerState = SchemaType<typeof MazePlayerState>;

export const MazeState = schema({
  /** "idle" → "running" → "done" (both at the exit) → "idle" */
  phase: t.string().default("idle"),
  /** Which maze (see shared/maze.ts generateMaze). */
  seed: t.uint32(),
  /** Server clock (ms) when the run started / how long it took. */
  startedAt: t.float64(),
  finishMs: t.uint32(),
  /** Fastest finish this session (0 = none yet). */
  bestMs: t.uint32(),
  /** sessionId of the player holding the map (they see only a little around them). */
  mapHolder: t.string().default(""),
  /** Players inside, keyed by sessionId. */
  players: t.map(MazePlayerState),
});
export type MazeState = SchemaType<typeof MazeState>;

/**
 * The one minigame running in the room (bowling / apples / toss), if any.
 *  "" → lobby (players gather) → playing → results → (play again or close)
 */
export const MinigameState = schema({
  /** "" (none), "bowling", "apples" or "toss". */
  game: t.string().default(""),
  phase: t.string().default(""),
  /** Participants (sessionIds), in turn order. */
  players: t.array("string"),
  /** Whose turn it is (bowling / toss). */
  turn: t.string().default(""),
  /** Throw number (1..turns). */
  round: t.uint8(),
  /** Score per sessionId: pins (bowling), apples, or best distance in cm (toss). */
  scores: t.map("number"),
  /** sessionId of the winner, "tie", or "". */
  winner: t.string().default(""),
  seed: t.uint32(),
  /** Server clock (ms) when play started (apples use it for timing). */
  startedAt: t.float64(),
  /** Apples: for each player, how many times each of their 3 apples was replaced, e.g. "0,2,1". */
  generations: t.map("string"),
});
export type MinigameState = SchemaType<typeof MinigameState>;

/** The farmer's current task (shared by both players, see shared/tasks.ts). */
export const FarmerState = schema({
  taskId: t.string().default(""),
  progress: t.uint8(),
  goal: t.uint8(),
  /** How many tasks have been finished this session. */
  completed: t.uint16(),
});
export type FarmerState = SchemaType<typeof FarmerState>;

/** The pumpkin-stealing crow. */
export const CrowState = schema({
  /** "gone" → "flyingIn" → "fleeing" (has a pumpkin!) → "leaving" → "gone" */
  phase: t.string().default("gone"),
  x: t.float32(),
  y: t.float32(),
  facingLeft: t.boolean(),
  /** Carrying a stolen pumpkin? */
  carrying: t.boolean(),
});
export type CrowState = SchemaType<typeof CrowState>;
