import { TILE } from "../../../../shared/constants";
import type { ObjectKind, PropType } from "../../../../shared/map/legend";
import { P } from "./palette";
import { makeCanvas, rect, px, ellipse, rng, type Ctx } from "./pixels";

/**
 * WORLD OBJECT ART (original)
 * ---------------------------
 * - Single-tile objects (trees, fences, hay...) from the map's character grid.
 * - Multi-tile props (farmhouse, stands...) from the map's `props` list.
 *
 * Every sprite is drawn with its bottom edge sitting on the bottom of its tile
 * footprint. Many are taller than their footprint (a tree is 2.5 tiles tall but
 * only blocks 1), which is what lets characters walk "behind" them.
 */

// ---------------------------------------------------------------- helpers

/** Outlined, shaded blob made of overlapping ellipses (tree canopies, hay piles). */
function blob(ctx: Ctx, parts: number[][], dark: string, main: string, light: string) {
  for (const [x, y, rx, ry] of parts) ellipse(ctx, x, y, rx + 1, ry + 1, P.outline);
  for (const [x, y, rx, ry] of parts) ellipse(ctx, x, y, rx, ry, dark);
  for (const [x, y, rx, ry] of parts) ellipse(ctx, x - 1, y - 1.5, rx - 1.5, ry - 1.5, main);
  for (const [x, y, rx, ry] of parts) ellipse(ctx, x - 2.5, y - 3, rx * 0.35, ry * 0.3, light);
}

function outlineRect(ctx: Ctx, x: number, y: number, w: number, h: number, fill: string) {
  rect(ctx, x, y, w, h, P.outline);
  rect(ctx, x + 1, y + 1, w - 2, h - 2, fill);
}

/** Wooden planks running horizontally, with a highlight and shadow on each. */
function planks(ctx: Ctx, x: number, y: number, w: number, h: number, step = 4) {
  rect(ctx, x, y, w, h, P.wood);
  for (let yy = y; yy < y + h; yy += step) {
    rect(ctx, x, yy, w, 1, P.woodLight);
    rect(ctx, x, Math.min(yy + step - 1, y + h - 1), w, 1, P.woodDark);
  }
}

/** Vertical stripes for awnings. */
function awning(ctx: Ctx, x: number, y: number, w: number, h: number, a: string, b: string) {
  for (let xx = 0; xx < w; xx += 8) {
    rect(ctx, x + xx, y, 8, h, (xx / 8) % 2 === 0 ? a : b);
    // Scalloped bottom edge
    ellipse(ctx, x + xx + 4, y + h, 4, 2.5, (xx / 8) % 2 === 0 ? a : b);
  }
  rect(ctx, x, y, w, 1, P.outline);
  rect(ctx, x, y + h + 2, w, 1, "rgba(0,0,0,0.25)");
}

function pumpkinShape(ctx: Ctx, cx: number, cy: number, rx: number, ry: number) {
  ellipse(ctx, cx, cy, rx + 1, ry + 1, P.outline);
  ellipse(ctx, cx, cy, rx, ry, P.orange);
  // Ribs
  for (const dx of [-rx * 0.5, 0, rx * 0.5]) rect(ctx, cx + dx, cy - ry + 1, 1, ry * 2 - 1, P.orangeDark);
  ellipse(ctx, cx - rx * 0.45, cy - ry * 0.35, rx * 0.25, ry * 0.25, P.orangeLight);
  rect(ctx, cx - 1, cy - ry - 2, 2, 3, P.stem);
  px(ctx, cx + 1, cy - ry - 2, P.leafGreenDark);
}

// ---------------------------------------------------------------- tile objects

const TREE_COLORS: [string, string, string][] = [
  [P.leafGreenDark, P.leafGreen, "#6f9e43"],
  [P.orangeDark, P.orange, P.orangeLight],
  [P.goldDark, P.gold, P.goldLight],
  [P.redDark, P.red, "#d8644a"],
];
export const TREE_VARIANTS = TREE_COLORS.length;

export function drawTree(variant: number) {
  const { canvas, ctx } = makeCanvas(32, 40);
  const [dark, main, light] = TREE_COLORS[variant];
  ctx.globalAlpha = 0.3;
  ellipse(ctx, 16, 37, 10, 3, P.black);
  ctx.globalAlpha = 1;
  // Trunk
  outlineRect(ctx, 12, 22, 8, 17, P.woodDark);
  rect(ctx, 13, 23, 2, 15, P.wood);
  rect(ctx, 10, 36, 3, 2, P.woodDark); rect(ctx, 19, 36, 3, 2, P.woodDark); // roots
  // Canopy
  blob(ctx, [[16, 15, 13, 11], [8, 19, 7, 6], [24, 19, 7, 6], [16, 7, 9, 6], [10, 10, 6, 5], [22, 10, 6, 5]], dark, main, light);
  const r = rng(variant + 3);
  for (let i = 0; i < 14; i++) px(ctx, 5 + Math.floor(r() * 22), 4 + Math.floor(r() * 20), dark);
  return canvas;
}

export function drawCorn(variant: number) {
  const { canvas, ctx } = makeCanvas(16, 28);
  const r = rng(40 + variant);
  const stalks = variant === 0 ? [3, 8, 13] : [2, 6, 11];
  for (const sx of stalks) {
    const top = 2 + Math.floor(r() * 4);
    rect(ctx, sx, top, 2, 27 - top, P.cornDark);
    rect(ctx, sx, top, 1, 27 - top, P.corn);
    // Leaves sticking out diagonally
    for (let y = top + 5; y < 24; y += 5) {
      const dir = (y / 5) % 2 === 0 ? 1 : -1;
      for (let i = 1; i <= 3; i++) px(ctx, sx + (dir > 0 ? 1 + i : -i), y - i + 1, P.cornLeaf);
    }
    // Tassel
    px(ctx, sx, top - 1, P.goldLight); px(ctx, sx - 1, top, P.gold); px(ctx, sx + 2, top, P.gold);
    // An ear of corn on some stalks
    if (r() < 0.6) { rect(ctx, sx + 2, 13, 2, 4, P.goldLight); px(ctx, sx + 2, 17, P.cornLeaf); }
  }
  return canvas;
}

export function drawHay() {
  const { canvas, ctx } = makeCanvas(16, 16);
  outlineRect(ctx, 0, 2, 16, 14, P.hay);
  rect(ctx, 1, 3, 14, 4, P.hayLight);
  const r = rng(9);
  for (let i = 0; i < 14; i++) px(ctx, 1 + Math.floor(r() * 14), 7 + Math.floor(r() * 7), P.hayDark);
  rect(ctx, 4, 2, 1, 14, P.woodDark);
  rect(ctx, 11, 2, 1, 14, P.woodDark);
  rect(ctx, 1, 14, 14, 1, P.hayDark);
  return canvas;
}

export function drawPumpkin() {
  const { canvas, ctx } = makeCanvas(16, 16);
  ctx.globalAlpha = 0.3; ellipse(ctx, 8, 14, 7, 2, P.black); ctx.globalAlpha = 1;
  pumpkinShape(ctx, 8, 10, 6.5, 4.5);
  return canvas;
}

/** Jack-o'-lantern. `lit` version is swapped in at dusk (phase 7). */
export function drawLantern(lit: boolean) {
  const { canvas, ctx } = makeCanvas(16, 16);
  ctx.globalAlpha = 0.3; ellipse(ctx, 8, 14, 7, 2, P.black); ctx.globalAlpha = 1;
  pumpkinShape(ctx, 8, 10, 6.5, 4.5);
  const face = lit ? P.glow : "#3a1a0e";
  // Triangle eyes
  px(ctx, 5, 8, face); rect(ctx, 4, 9, 3, 1, face);
  px(ctx, 11, 8, face); rect(ctx, 10, 9, 3, 1, face);
  // Grin
  rect(ctx, 4, 11, 9, 1, face); rect(ctx, 5, 12, 7, 1, face);
  px(ctx, 6, 11, P.orange); px(ctx, 10, 12, P.orange); // teeth
  return canvas;
}

export function drawFence(kind: "fenceH" | "fenceV" | "fencePost") {
  const { canvas, ctx } = makeCanvas(16, 20);
  const post = (x: number) => {
    outlineRect(ctx, x, 6, 5, 14, P.wood);
    rect(ctx, x + 1, 7, 3, 1, P.woodLight);
    rect(ctx, x + 1, 18, 3, 1, P.woodDark);
  };
  if (kind === "fenceH") {
    for (const y of [9, 14]) { rect(ctx, 0, y - 1, 16, 4, P.outline); rect(ctx, 0, y, 16, 2, P.woodLight); }
    post(6);
  } else if (kind === "fenceV") {
    // Seen from above: a rail running up into the next tile, post at the bottom.
    rect(ctx, 6, 0, 4, 12, P.outline); rect(ctx, 7, 0, 2, 12, P.woodLight);
    post(5);
  } else {
    post(5);
    rect(ctx, 4, 5, 7, 2, P.woodDark);
  }
  return canvas;
}

/** Texture key + drawing function for each single-tile object kind. */
export function objectTextureKey(kind: ObjectKind, tx: number, ty: number, h: number): string {
  switch (kind) {
    case "tree": return `tree_${Math.floor(h * TREE_VARIANTS) % TREE_VARIANTS}`;
    case "corn": return `corn_${(tx + ty) % 2}`;
    default: return kind;
  }
}

// ---------------------------------------------------------------- props

function drawFarmhouse() {
  const W = 9 * TILE, H = 6 * TILE + 16;
  const { canvas, ctx } = makeCanvas(W, H);
  // Wall
  const wallTop = 56;
  outlineRect(ctx, 10, wallTop, W - 20, H - wallTop, P.red);
  for (let x = 14; x < W - 12; x += 5) rect(ctx, x, wallTop + 1, 1, H - wallTop - 2, P.redDark);
  rect(ctx, 11, wallTop + 1, W - 22, 2, P.cream);           // trim under roof
  rect(ctx, 11, H - 7, W - 22, 6, "#6b5a4e");                // stone foundation
  for (let x = 12; x < W - 12; x += 6) rect(ctx, x, H - 7, 1, 6, "#4f423a");
  // Windows with warm light and flower boxes
  for (const wx of [24, W - 46]) {
    outlineRect(ctx, wx, 68, 22, 20, P.cream);
    rect(ctx, wx + 2, 70, 18, 16, P.glow);
    rect(ctx, wx + 2, 70, 18, 4, P.goldLight);
    rect(ctx, wx + 10, 70, 2, 16, P.cream); rect(ctx, wx + 2, 77, 18, 2, P.cream);
    outlineRect(ctx, wx - 1, 88, 24, 5, P.woodDark);
    for (let i = 0; i < 5; i++) px(ctx, wx + 2 + i * 4, 87, i % 2 ? P.orange : P.gold);
  }
  // Door
  const dx = W / 2 - 10;
  outlineRect(ctx, dx - 2, 74, 24, H - 74 - 6, P.cream);
  rect(ctx, dx, 76, 20, H - 76 - 6, P.woodDark);
  rect(ctx, dx + 9, 76, 2, H - 82, P.woodDeep);
  px(ctx, dx + 15, 92, P.gold);
  ellipse(ctx, dx + 10, 82, 4, 4, P.leafGreenDark); ellipse(ctx, dx + 10, 82, 2, 2, P.woodDark); // wreath
  px(ctx, dx + 10, 78, P.red);
  // Roof (dusky purple shingles) with sloped sides
  for (let y = 4; y < wallTop + 4; y++) {
    const inset = Math.max(0, 22 - (y - 4) * 0.9);
    const x0 = 2 + inset, x1 = W - 2 - inset;
    rect(ctx, x0, y, x1 - x0, 1, (Math.floor(y / 4) % 2 === 0) ? P.dusk : P.plumDark);
    px(ctx, x0, y, P.outline); px(ctx, x1 - 1, y, P.outline);
  }
  for (let y = 8; y < wallTop; y += 4) {
    for (let x = 10 + ((y / 4) % 2) * 4; x < W - 10; x += 8) px(ctx, x, y, P.outline);
  }
  rect(ctx, 24, 3, W - 48, 2, P.outline);
  rect(ctx, 2, wallTop + 2, W - 4, 2, P.outline);
  // Chimney
  outlineRect(ctx, W - 40, 0, 12, 20, P.redDark);
  rect(ctx, W - 41, 0, 14, 3, "#5a4a42");
  return canvas;
}

function drawCarvingTable() {
  const { canvas, ctx } = makeCanvas(32, 24);
  outlineRect(ctx, 0, 10, 32, 7, P.woodLight);
  rect(ctx, 1, 15, 30, 1, P.woodDark);
  outlineRect(ctx, 2, 16, 4, 8, P.woodDark);
  outlineRect(ctx, 26, 16, 4, 8, P.woodDark);
  pumpkinShape(ctx, 14, 9, 6, 4.5);
  rect(ctx, 23, 11, 6, 1, "#c9c9c9"); rect(ctx, 22, 11, 2, 2, P.woodDeep); // little carving knife
  return canvas;
}

function drawCiderStand() {
  const W = 64, H = 64;
  const { canvas, ctx } = makeCanvas(W, H);
  outlineRect(ctx, 4, 16, 56, 26, P.woodDark);                // back wall
  for (let x = 8; x < 58; x += 6) rect(ctx, x, 17, 1, 24, P.woodDeep);
  // Hanging mugs
  for (let x = 12; x < 54; x += 10) { outlineRect(ctx, x, 22, 5, 6, P.cream); px(ctx, x + 5, 24, P.outline); }
  outlineRect(ctx, 1, 14, 5, 50, P.wood); outlineRect(ctx, W - 6, 14, 5, 50, P.wood); // posts
  // Counter
  outlineRect(ctx, 2, 40, W - 4, 24, P.wood);
  planks(ctx, 3, 44, W - 6, 19, 5);
  rect(ctx, 3, 41, W - 6, 3, P.woodLight);
  // Cups + jug + apples on counter
  outlineRect(ctx, 10, 35, 5, 6, P.cream); outlineRect(ctx, 18, 35, 5, 6, P.cream);
  outlineRect(ctx, 28, 31, 9, 10, P.orangeDark); rect(ctx, 30, 33, 2, 6, P.orangeLight);
  for (const [x, y] of [[44, 37], [48, 36], [52, 37], [46, 34], [50, 34]]) { ellipse(ctx, x, y, 2.5, 2.5, P.outline); ellipse(ctx, x, y, 1.6, 1.6, P.apple); }
  // Striped awning on top
  awning(ctx, 0, 2, W, 12, P.orange, P.cream);
  return canvas;
}

function drawBench() {
  const { canvas, ctx } = makeCanvas(32, 16);
  outlineRect(ctx, 0, 1, 32, 5, P.wood);   // backrest
  rect(ctx, 1, 2, 30, 1, P.woodLight);
  outlineRect(ctx, 0, 6, 32, 6, P.woodLight); // seat
  rect(ctx, 1, 10, 30, 1, P.woodDark);
  outlineRect(ctx, 2, 11, 4, 5, P.woodDark); outlineRect(ctx, 26, 11, 4, 5, P.woodDark);
  return canvas;
}

function drawSign() {
  const { canvas, ctx } = makeCanvas(16, 20);
  outlineRect(ctx, 6, 9, 4, 11, P.woodDark);
  outlineRect(ctx, 0, 2, 16, 10, P.woodLight);
  rect(ctx, 1, 10, 14, 1, P.wood);
  rect(ctx, 3, 5, 10, 1, P.woodDark); rect(ctx, 3, 7, 7, 1, P.woodDark);
  return canvas;
}

function drawMazeArch() {
  const W = 64, H = 48;
  const { canvas, ctx } = makeCanvas(W, H);
  for (const x of [2, W - 10]) {
    outlineRect(ctx, x, 8, 8, 40, P.woodDark);
    for (let y = 12; y < 46; y += 6) { rect(ctx, x + 1, y, 6, 2, P.corn); px(ctx, x + 2, y + 2, P.cornLeaf); }
  }
  outlineRect(ctx, 0, 8, W, 9, P.wood);
  rect(ctx, 1, 9, W - 2, 2, P.woodLight);
  blob(ctx, [[14, 6, 12, 4], [32, 5, 14, 5], [50, 6, 12, 4]], P.hayDark, P.hay, P.hayLight);
  pumpkinShape(ctx, 32, 15, 4, 3);
  return canvas;
}

function drawScarecrowPost() {
  const { canvas, ctx } = makeCanvas(16, 32);
  outlineRect(ctx, 6, 2, 4, 30, P.wood);
  outlineRect(ctx, 0, 10, 16, 4, P.wood);
  rect(ctx, 7, 3, 1, 28, P.woodLight);
  return canvas;
}

function drawBowlingPins() {
  const { canvas, ctx } = makeCanvas(32, 16);
  const pin = (x: number, y: number) => {
    outlineRect(ctx, x, y, 6, 7, P.hay);
    rect(ctx, x + 1, y + 1, 4, 2, P.hayLight);
    rect(ctx, x + 1, y + 4, 4, 1, P.red);
  };
  for (const [x, y] of [[4, 1], [13, 1], [22, 1], [8, 5], [18, 5], [13, 9]]) pin(x, y);
  return canvas;
}

function drawAppleBarrel() {
  const { canvas, ctx } = makeCanvas(32, 36);
  outlineRect(ctx, 2, 10, 28, 26, P.woodDark);
  for (let x = 6; x < 28; x += 5) rect(ctx, x, 11, 1, 24, P.woodDeep);
  rect(ctx, 3, 12, 26, 2, P.wood);
  for (const y of [16, 29]) rect(ctx, 2, y, 28, 2, "#5a5250");
  ellipse(ctx, 16, 10, 15, 6, P.outline);
  ellipse(ctx, 16, 10, 13, 4.5, P.water);
  rect(ctx, 8, 9, 5, 1, P.waterLight);
  for (const [x, y] of [[10, 10], [18, 8], [22, 11], [14, 12]]) {
    ellipse(ctx, x, y, 2.5, 2.5, P.outline); ellipse(ctx, x, y, 1.7, 1.7, P.apple);
    px(ctx, x, y - 2, P.stem);
  }
  return canvas;
}

function drawTossFlag() {
  const { canvas, ctx } = makeCanvas(16, 24);
  rect(ctx, 7, 2, 2, 22, P.outline); rect(ctx, 7, 2, 1, 21, P.cream);
  for (let i = 0; i < 6; i++) rect(ctx, 9, 3 + i, 6 - i, 1, i < 3 ? P.orange : P.orangeDark);
  return canvas;
}

/** The hayride wagon (64x44). It's drawn as its own texture because it moves. */
export function drawWagon() {
  const W = 64, H = 44;
  const { canvas, ctx } = makeCanvas(W, H);
  // Tongue / hitch on the left
  rect(ctx, 0, 30, 8, 3, P.outline); rect(ctx, 0, 31, 8, 1, P.woodDark);
  // Hay pile
  blob(ctx, [[20, 14, 12, 7], [36, 12, 14, 8], [50, 14, 10, 7]], P.hayDark, P.hay, P.hayLight);
  // Wagon bed
  outlineRect(ctx, 6, 18, 56, 16, P.wood);
  planks(ctx, 7, 19, 54, 14, 5);
  rect(ctx, 7, 18, 54, 1, P.woodLight);
  // Wheels
  for (const cx of [16, 52]) {
    ellipse(ctx, cx, 36, 8, 8, P.outline);
    ellipse(ctx, cx, 36, 6.5, 6.5, P.woodDeep);
    ellipse(ctx, cx, 36, 5, 5, P.woodDark);
    rect(ctx, cx - 5, 36, 10, 1, P.woodDeep); rect(ctx, cx, 31, 1, 10, P.woodDeep);
    ellipse(ctx, cx, 36, 1.5, 1.5, P.gold);
  }
  return canvas;
}

function drawPrizeStand() {
  const W = 80, H = 64;
  const { canvas, ctx } = makeCanvas(W, H);
  outlineRect(ctx, 4, 16, W - 8, 26, P.plumDark);
  // Shelves of prizes: little hats and colorful pumpkins
  for (const y of [22, 32]) {
    rect(ctx, 6, y + 6, W - 12, 2, P.woodDark);
    for (let i = 0; i < 6; i++) {
      const x = 10 + i * 11;
      const colors = [P.orange, P.gold, P.cream, P.red, "#6aa0b8", P.leafGreen];
      if (y === 22) { rect(ctx, x, y + 2, 7, 4, colors[i]); rect(ctx, x - 1, y + 5, 9, 1, colors[i]); rect(ctx, x, y + 2, 7, 1, P.outline); }
      else { ellipse(ctx, x + 3, y + 3, 3.5, 2.5, colors[(i + 2) % 6]); px(ctx, x + 3, y, P.stem); }
    }
  }
  outlineRect(ctx, 1, 14, 5, 50, P.wood); outlineRect(ctx, W - 6, 14, 5, 50, P.wood);
  outlineRect(ctx, 2, 42, W - 4, 22, P.wood);
  planks(ctx, 3, 46, W - 6, 17, 5);
  rect(ctx, 3, 43, W - 6, 3, P.woodLight);
  // Ticket on the counter
  outlineRect(ctx, 34, 36, 12, 7, P.gold); rect(ctx, 37, 38, 6, 3, P.goldDark);
  awning(ctx, 0, 2, W, 12, P.plum, P.gold);
  return canvas;
}

function drawPhotoBooth() {
  const W = 48, H = 56;
  const { canvas, ctx } = makeCanvas(W, H);
  // Painted backdrop: dusky sky, moon, rolling hills, pumpkins
  outlineRect(ctx, 2, 4, W - 4, 26, P.plum);
  rect(ctx, 3, 5, W - 6, 10, P.dusk);
  ellipse(ctx, 36, 12, 4, 4, P.goldLight);
  ellipse(ctx, 14, 30, 16, 8, P.leafGreenDark);
  ellipse(ctx, 36, 30, 14, 6, P.grassDeep);
  rect(ctx, 3, 26, W - 6, 3, P.leafGreenDark);
  pumpkinShape(ctx, 12, 25, 3, 2); pumpkinShape(ctx, 34, 26, 3, 2);
  // Frame posts (in front)
  outlineRect(ctx, 0, 2, 6, H - 2, P.wood); outlineRect(ctx, W - 6, 2, 6, H - 2, P.wood);
  rect(ctx, 1, 3, 1, H - 4, P.woodLight); rect(ctx, W - 5, 3, 1, H - 4, P.woodLight);
  // Top beam with a little camera icon
  outlineRect(ctx, 0, 0, W, 7, P.woodDark);
  outlineRect(ctx, 19, 1, 10, 6, P.black); ellipse(ctx, 24, 4, 1.5, 1.5, P.waterLight);
  return canvas;
}

function drawBasket() {
  const { canvas, ctx } = makeCanvas(16, 18);
  // Handle
  ellipse(ctx, 8, 7, 6, 6, P.outline); ellipse(ctx, 8, 7, 5, 5, P.woodLight); ellipse(ctx, 8, 7, 4, 4, "rgba(0,0,0,0)");
  ctx.clearRect(3, 4, 10, 5);
  rect(ctx, 2, 3, 1, 6, P.outline); rect(ctx, 13, 3, 1, 6, P.outline); rect(ctx, 3, 1, 10, 1, P.outline); rect(ctx, 3, 2, 10, 1, P.woodLight);
  // Woven body
  outlineRect(ctx, 1, 8, 14, 10, P.wood);
  for (let y = 9; y < 17; y += 2) for (let x = 2 + (y % 4 === 1 ? 0 : 1); x < 14; x += 2) px(ctx, x, y, P.woodDark);
  rect(ctx, 1, 8, 14, 2, P.woodLight); rect(ctx, 1, 8, 14, 1, P.outline);
  return canvas;
}

export interface PropArt {
  draw: () => HTMLCanvasElement;
  /**
   * Which row of the prop (0 = top row) counts as its "floor line" for
   * Y-sorting. Default: the bottom row. Characters lower on screen than this
   * row are drawn in front, higher ones behind.
   * The photo booth uses its top row so you can stand inside the frame;
   * the maze arch uses a row past its bottom so you always walk under it.
   */
  depthRow?: number;
}

export const PROP_ART: Record<PropType, PropArt> = {
  farmhouse: { draw: drawFarmhouse },
  carvingTable: { draw: drawCarvingTable },
  ciderStand: { draw: drawCiderStand },
  bench: { draw: drawBench },
  sign: { draw: drawSign },
  mazeArch: { draw: drawMazeArch, depthRow: 3 },
  scarecrowPost: { draw: drawScarecrowPost },
  bowlingPins: { draw: drawBowlingPins },
  appleBarrel: { draw: drawAppleBarrel },
  tossFlag: { draw: drawTossFlag },
  basket: { draw: drawBasket },
  prizeStand: { draw: drawPrizeStand },
  photoBooth: { draw: drawPhotoBooth, depthRow: 0 },
};

// ---------------------------------------------------------------- effects

export const LEAF_COLORS = [P.orange, P.gold, P.red];

/** A tiny falling leaf (5x4). */
export function drawLeaf(variant: number) {
  const { canvas, ctx } = makeCanvas(5, 4);
  const c = LEAF_COLORS[variant % LEAF_COLORS.length];
  rect(ctx, 1, 0, 3, 1, c);
  rect(ctx, 0, 1, 5, 2, c);
  rect(ctx, 1, 3, 2, 1, c);
  px(ctx, 4, 3, P.woodDark); // stem
  px(ctx, 1, 1, P.goldLight);
  return canvas;
}

/** Big field pumpkin (worth 3 points, slows you down). 22x18. */
export function drawBigPumpkin() {
  const { canvas, ctx } = makeCanvas(22, 18);
  ctx.globalAlpha = 0.3; ellipse(ctx, 11, 16, 10, 2, P.black); ctx.globalAlpha = 1;
  pumpkinShape(ctx, 11, 11, 9.5, 5.5);
  return canvas;
}

/** Emote speech bubbles (13x13): heart, laugh, wave, exclaim. */
export function drawEmote(kind: number) {
  const { canvas, ctx } = makeCanvas(13, 13);
  outlineRect(ctx, 0, 0, 13, 11, P.cream);
  px(ctx, 0, 0, "rgba(0,0,0,0)"); px(ctx, 12, 0, "rgba(0,0,0,0)");
  ctx.clearRect(0, 0, 1, 1); ctx.clearRect(12, 0, 1, 1); ctx.clearRect(0, 10, 1, 1); ctx.clearRect(12, 10, 1, 1);
  rect(ctx, 5, 11, 3, 1, P.outline); px(ctx, 6, 12, P.outline); px(ctx, 6, 11, P.cream); // tail
  const art: Record<number, string[]> = {
    0: [".rr.rr.", "rrrrrrr", "rrrrrrr", ".rrrrr.", "..rrr..", "...r..."],          // heart
    1: ["o.....o", ".o...o.", ".......", "ooooooo", ".orrro.", "..ooo.."],          // laughing face ^ ^ D
    2: ["..s.s..", ".ss.ss.", ".sssss.", "ssssss.", ".ssss..", "..ss..."],          // waving hand
    3: ["...o...", "..ooo..", "..ooo..", "...o...", ".......", "...o..."],          // !
  };
  const pal = { r: P.red, o: P.outline, s: "#f4c99b" };
  art[kind].forEach((row, y) => { for (let x = 0; x < row.length; x++) { const c = (pal as Record<string, string>)[row[x]]; if (c) px(ctx, 3 + x, 2 + y, c); } });
  if (kind === 3) { rect(ctx, 6, 2, 1, 4, P.orangeDark); rect(ctx, 6, 7, 1, 1, P.orangeDark); }
  return canvas;
}

/** A soft round glow (drawn additively behind lit jack-o'-lanterns). */
export function drawGlow() {
  const { canvas, ctx } = makeCanvas(48, 48);
  const g = ctx.createRadialGradient(24, 24, 0, 24, 24, 24);
  g.addColorStop(0, "rgba(255, 200, 90, 0.9)");
  g.addColorStop(0.4, "rgba(255, 150, 50, 0.35)");
  g.addColorStop(1, "rgba(255, 120, 30, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 48, 48);
  return canvas;
}

/** Screen-edge darkening for cozy moments. */
export function drawVignette() {
  const { canvas, ctx } = makeCanvas(256, 256);
  const g = ctx.createRadialGradient(128, 128, 60, 128, 128, 180);
  g.addColorStop(0, "rgba(60, 25, 10, 0)");
  g.addColorStop(1, "rgba(60, 25, 10, 0.55)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return canvas;
}

/**
 * A finished carved pumpkin for the porch, 20x16. The 32x24 carving grid is
 * shrunk 2x onto the pumpkin's face; a carved spot shows if any of the 4 grid
 * pixels it covers was carved.
 */
export function drawCarvedPumpkin(pixels: Uint8Array, gridW: number, gridH: number) {
  const { canvas, ctx } = makeCanvas(20, 16);
  pumpkinShape(ctx, 10, 9.5, 9, 5.5);
  for (let y = 0; y < gridH / 2; y++) {
    for (let x = 0; x < gridW / 2; x++) {
      const i = y * 2 * gridW + x * 2;
      if (pixels[i] || pixels[i + 1] || pixels[i + gridW] || pixels[i + gridW + 1]) {
        // Face area is 16x12, centered on the pumpkin body.
        px(ctx, 2 + x, 4 + y, P.glow);
      }
    }
  }
  return canvas;
}
