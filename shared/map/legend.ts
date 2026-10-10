/**
 * What each character in a map's `rows` means.
 *
 * - `ground`  : which ground tile to draw underneath (see client art/tiles.ts).
 * - `object`  : optional sprite drawn on top of the ground, Y-sorted with the
 *               players so characters can walk behind it (trees, fences...).
 * - `blocks`  : can players walk on this tile?
 *
 * To add a new tile type: add a line here, then add its art in the client
 * (art/tiles.ts for ground, art/props.ts for objects).
 */
export type GroundKind = "grass" | "flowers" | "path" | "dirt" | "soil" | "porch" | "lane" | "water";

export type ObjectKind =
  | "tree" | "corn" | "hay" | "pumpkin" | "lantern"
  | "fenceH" | "fenceV" | "fencePost";

export interface TileInfo {
  ground: GroundKind;
  object?: ObjectKind;
  blocks: boolean;
}

export const LEGEND: Record<string, TileInfo> = {
  ".": { ground: "grass", blocks: false },
  '"': { ground: "flowers", blocks: false },
  "=": { ground: "path", blocks: false },
  "_": { ground: "dirt", blocks: false },
  ":": { ground: "soil", blocks: false },
  "#": { ground: "porch", blocks: false },
  "L": { ground: "lane", blocks: false },
  "~": { ground: "water", blocks: true },
  "T": { ground: "grass", object: "tree", blocks: true },
  "C": { ground: "soil", object: "corn", blocks: true },
  "h": { ground: "grass", object: "hay", blocks: true },
  "p": { ground: "grass", object: "pumpkin", blocks: true },
  "j": { ground: "grass", object: "lantern", blocks: true },
  "-": { ground: "grass", object: "fenceH", blocks: true },
  "|": { ground: "grass", object: "fenceV", blocks: true },
  "+": { ground: "grass", object: "fencePost", blocks: true },
};

/** Multi-tile objects. Their art is in client/src/game/art/props.ts. */
export type PropType =
  | "farmhouse" | "carvingTable" | "ciderStand" | "bench" | "sign"
  | "mazeArch" | "scarecrowPost" | "bowlingPins" | "appleBarrel" | "tossFlag"
  | "prizeStand" | "photoBooth" | "basket" | "farmer" | "noteBoard";

export interface PropDef {
  /** Unique name, used later to hook up interactions. */
  id: string;
  type: PropType;
  /** Top-left tile. */
  x: number;
  y: number;
  /** Size in tiles. */
  w: number;
  h: number;
  /** "all", "none", or one string per row with "x" = blocked, "." = open. */
  solid: "all" | "none" | string[];
  /** Optional caption shown above it. */
  label?: string;
}

export interface HayrideDef {
  /** Footprint of the parked wagon (top-left tile + size in tiles). */
  home: { x: number; y: number; w: number; h: number };
  /** Wagon-center waypoints in tile units; `stop` marks a station. */
  route: { x: number; y: number; stop?: string }[];
}

export interface Tile { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

export interface MapDef {
  rows: string[];
  props: PropDef[];
  spawns: Tile[];
  porchSpots?: Tile[];
  hayride?: HayrideDef;
  /** Giant pumpkin push: where it starts (top-left of its 2x2) and where to roll it. */
  giantPumpkin?: { start: Tile; goal: Tile };
  /** Possible hiding spots for scarecrow parts; 3 are picked at random each session. */
  scarecrowSpots?: Tile[];
  /** Where you press E to enter the corn maze. */
  mazeEntrance?: Rect;
  /** Minigame stations: stand on / face these tiles to play. */
  stations?: Record<"bowling" | "apples" | "toss", Rect>;
}
