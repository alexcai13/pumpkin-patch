import { TILE } from "../../../../shared/constants";
import type { GroundKind } from "../../../../shared/map/legend";
import { P } from "./palette";
import { makeCanvas, rect, px, rng, type Ctx } from "./pixels";

/**
 * GROUND TILESET (original art)
 * -----------------------------
 * One image, 16 tiles wide. Each ground kind gets one row:
 *
 *   row 0 grass   · row 1 flowers · row 2 path  · row 3 dirt
 *   row 4 soil    · row 5 porch   · row 6 lane  · row 7 water
 *
 * "Plain" kinds (grass, flowers, porch, lane) use columns 0-3 as random
 * variations so the ground doesn't look like wallpaper.
 *
 * "Edged" kinds (path, dirt, soil, water) use the column as an edge mask:
 * add 1 if the tile above is different, 2 for right, 4 for below, 8 for left.
 * Column 0 = surrounded by the same kind, column 15 = an island.
 * That's how paths get soft grassy borders automatically.
 */
export const TILESET_COLS = 16;
export const GROUND_ROWS: GroundKind[] = ["grass", "flowers", "path", "dirt", "soil", "porch", "lane", "water"];
export const EDGED_KINDS = new Set<GroundKind>(["path", "dirt", "soil", "water"]);
export const PLAIN_VARIANTS = 4;

/** Kinds that blend together without an edge between them. */
export function sameGroup(a: GroundKind, b: GroundKind) {
  const earth = (k: GroundKind) => k === "path" || k === "dirt";
  return a === b || (earth(a) && earth(b));
}

function grassBase(ctx: Ctx, seed: number, ox = 0, oy = 0) {
  const r = rng(seed);
  rect(ctx, ox, oy, TILE, TILE, P.grass);
  // Little blades of grass: a dark pixel with a light one on top.
  for (let i = 0; i < 7; i++) {
    const x = ox + Math.floor(r() * 15);
    const y = oy + 1 + Math.floor(r() * 14);
    px(ctx, x, y, P.grassDark);
    px(ctx, x + 1, y - 1, P.grassDark);
    if (r() < 0.5) px(ctx, x, y - 1, P.grassLight);
  }
  // A fallen leaf now and then.
  if (r() < 0.35) {
    const x = ox + 2 + Math.floor(r() * 11);
    const y = oy + 2 + Math.floor(r() * 11);
    const c = r() < 0.5 ? P.orange : P.gold;
    px(ctx, x, y, c); px(ctx, x + 1, y, c); px(ctx, x, y + 1, P.orangeDark);
  }
}

function drawPlain(ctx: Ctx, kind: GroundKind, variant: number) {
  const seed = 1000 + variant * 77 + GROUND_ROWS.indexOf(kind) * 13;
  const r = rng(seed);
  switch (kind) {
    case "grass":
      grassBase(ctx, seed);
      break;
    case "flowers": {
      grassBase(ctx, seed);
      const colors = [P.plum, P.gold, P.cream, P.orangeLight];
      for (let i = 0; i < 3; i++) {
        const x = 2 + Math.floor(r() * 11);
        const y = 3 + Math.floor(r() * 10);
        px(ctx, x, y + 1, P.grassDeep); // stem
        const c = colors[Math.floor(r() * colors.length)];
        px(ctx, x, y, c); px(ctx, x - 1, y, c); px(ctx, x + 1, y, c); px(ctx, x, y - 1, c);
        px(ctx, x, y, P.goldLight);
      }
      // Tall tuft
      const tx = 3 + Math.floor(r() * 9);
      rect(ctx, tx, 9, 1, 5, P.grassDeep); rect(ctx, tx + 2, 8, 1, 6, P.grassDark); rect(ctx, tx + 4, 10, 1, 4, P.grassDeep);
      break;
    }
    case "porch":
      rect(ctx, 0, 0, TILE, TILE, P.wood);
      // Horizontal planks, 4px tall, with offset seams.
      for (let y = 0; y < TILE; y += 4) {
        rect(ctx, 0, y + 3, TILE, 1, P.woodDark);
        rect(ctx, 0, y, TILE, 1, P.woodLight);
        const seam = (variant * 5 + y * 3) % TILE;
        rect(ctx, seam, y, 1, 3, P.woodDark);
        if (r() < 0.6) px(ctx, Math.floor(r() * 16), y + 1, P.woodDark); // knot
      }
      break;
    case "lane":
      rect(ctx, 0, 0, TILE, TILE, P.lane);
      for (let x = 0; x < TILE; x += 4) rect(ctx, x, 0, 1, TILE, P.laneDark);
      rect(ctx, 2 + variant, (variant * 7) % 16, 1, 2, P.goldLight); // shine
      break;
    default:
      rect(ctx, 0, 0, TILE, TILE, "#ff00ff");
  }
}

function drawEdged(ctx: Ctx, kind: GroundKind, mask: number) {
  const r = rng(5000 + mask * 31 + GROUND_ROWS.indexOf(kind) * 7);
  // Base fill
  if (kind === "path" || kind === "dirt") {
    rect(ctx, 0, 0, TILE, TILE, kind === "path" ? P.dirt : P.packed);
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(r() * 15), y = Math.floor(r() * 15);
      px(ctx, x, y, P.dirtDark);
      if (r() < 0.5) px(ctx, x + 1, y, P.dirtLight);
    }
  } else if (kind === "soil") {
    rect(ctx, 0, 0, TILE, TILE, P.soil);
    // Furrows (planting rows)
    for (let y = 1; y < TILE; y += 4) {
      rect(ctx, 0, y, TILE, 1, P.soilLight);
      rect(ctx, 0, y + 2, TILE, 1, P.soilDark);
    }
    for (let i = 0; i < 4; i++) px(ctx, Math.floor(r() * 16), Math.floor(r() * 16), P.soilDark);
  } else if (kind === "water") {
    rect(ctx, 0, 0, TILE, TILE, P.water);
    for (let i = 0; i < 3; i++) {
      const x = Math.floor(r() * 11), y = 2 + Math.floor(r() * 12);
      rect(ctx, x, y, 3 + Math.floor(r() * 3), 1, P.waterLight);
    }
    px(ctx, Math.floor(r() * 16), Math.floor(r() * 16), P.waterDark);
  }

  // Edges: grass creeping in from neighbors that aren't the same kind.
  const N = mask & 1, E = mask & 2, S = mask & 4, W = mask & 8;
  const edgeColor = kind === "water" ? P.waterDark : kind === "soil" ? P.soilDark : P.dirtDark;
  const lip = (x: number, y: number, w: number, h: number) => rect(ctx, x, y, w, h, P.grass);
  if (N) { lip(0, 0, 16, 2); for (let x = 0; x < 16; x += 3) px(ctx, x + 1, 2, P.grass); rect(ctx, 0, 2, 16, 1, edgeColor); }
  if (S) { lip(0, 14, 16, 2); for (let x = 0; x < 16; x += 3) px(ctx, x, 13, P.grassDark); }
  if (W) { lip(0, 0, 2, 16); for (let y = 0; y < 16; y += 3) px(ctx, 2, y + 1, P.grass); rect(ctx, 2, N ? 3 : 0, 1, 16, edgeColor); }
  if (E) { lip(14, 0, 2, 16); for (let y = 0; y < 16; y += 3) px(ctx, 13, y, P.grass); rect(ctx, 13, N ? 3 : 0, 1, 16, edgeColor); }
  if (N) rect(ctx, 0, 2, 16, 1, edgeColor);
}

/** Builds the whole ground tileset image. */
export function drawTileset() {
  const { canvas, ctx } = makeCanvas(TILESET_COLS * TILE, GROUND_ROWS.length * TILE);
  GROUND_ROWS.forEach((kind, row) => {
    for (let col = 0; col < TILESET_COLS; col++) {
      const { canvas: tile, ctx: tctx } = makeCanvas(TILE, TILE);
      if (EDGED_KINDS.has(kind)) drawEdged(tctx, kind, col);
      else drawPlain(tctx, kind, col % PLAIN_VARIANTS);
      ctx.drawImage(tile, col * TILE, row * TILE);
    }
  });
  return canvas;
}
