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
  /** Which of the 4 photos is coming up (1-4) while shooting. */
  shot: t.uint8(),
  /** 3, 2, 1 before each photo; 0 at the moment it's taken. */
  countdown: t.uint8(),
});
export type BoothState = SchemaType<typeof BoothState>;
