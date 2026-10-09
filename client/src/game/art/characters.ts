import { PLAYER_COLORS } from "../../../../shared/constants";
import { drawRows, flipX, makeCanvas, ellipse } from "./pixels";

/**
 * PLAYER CHARACTER SPRITES (original art)
 * ---------------------------------------
 * Each frame is 16x20 pixels. A sprite sheet is one row of 12 frames:
 *
 *   0-2  facing down   (stand, step A, step B)
 *   3-5  facing left   (stand, stride, stride)
 *   6-8  facing right  (mirror of left)
 *   9-11 facing up     (stand, step A, step B)
 *
 * To swap in your own art, drop a 192x20 PNG laid out the same way into
 * public/assets/ and list it in public/assets/manifest.json (see README there).
 *
 * Palette letters:  o outline · s/S skin · h/H hair · c/C clothing (recolored
 * per player) · p/P pants · b boots · e eyes
 */
export const CHAR_W = 16;
export const CHAR_H = 20;
export const CHAR_FRAMES = 12;

/** Frame numbers for each direction, indexed by Dir (Down, Left, Right, Up). */
export const DIR_FRAMES = [
  { stand: 0, walk: [1, 0, 2, 0] },
  { stand: 3, walk: [4, 3, 5, 3] },
  { stand: 6, walk: [7, 6, 8, 6] },
  { stand: 9, walk: [10, 9, 11, 9] },
];

// Head + beanie, shared by every direction (rows 0-4).
const HAT = [
  "................",
  ".....oooooo.....",
  "....occcccCo....",
  "...occccccCCo...",
  "...oCCCCCCCCo...",
];

const FACE_DOWN = [
  "...ohssssssho...",
  "...ossessesso...",
  "...ossessesso...",
  "...oSssssssSo...",
  "....oSSssSSo....",
];
const HAIR_UP = [
  "...ohhhhhhhho...",
  "...ohhhhhhhho...",
  "...ohhhHHhhho...",
  "...oHhhhhhhHo...",
  "....oHHhhHHo....",
];
const FACE_LEFT = [
  "...osssshhhho...",
  "...osesshhhho...",
  "...osesshhhho...",
  "...osssssShho...",
  "....oSssShho....",
];

// Torso rows 10-15.
const BODY_FRONT = [
  "...oocccccCoo...",
  "..occccccccCCo..",
  "..osccccccCCso..",
  "...oCCCCCCCCo...",
  "...oppppppppo...",
  "...opppPPpppo...",
];
const BODY_SIDE = [
  "....oocccCoo....",
  "....occcccCo....",
  "....occscCCo....",
  "....oCCCCCCo....",
  "....oppppppo....",
  "....opppPPpo....",
];

// Legs rows 16-19.
const LEGS_STAND = ["...oppo..oppo...", "...obbo..obbo...", "...oooo..oooo...", "................"];
const LEGS_STEP_A = ["...oppo..oppo...", "...obbo..oooo...", "...oooo.........", "................"];
const LEGS_STEP_B = ["...oppo..oppo...", "...oooo..obbo...", ".........oooo...", "................"];
const LEGS_SIDE_STAND = [".....oppppo.....", "....obbbbbo.....", "....ooooooo.....", "................"];
const LEGS_SIDE_STRIDE = ["....oppooppo....", "...obbo..obbo...", "...oooo..oooo...", "................"];

const BASE_PALETTE: Record<string, string> = {
  o: "#2a1a14",
  s: "#f4c99b", S: "#d49a6c",
  h: "#6b3d22", H: "#8a5530",
  p: "#4b3b5c", P: "#382a47",
  b: "#3b2618",
  e: "#21130e",
};

/**
 * Builds one frame. `bob` shifts the upper body down 1px on step frames,
 * which gives the walk a little bounce.
 */
function frame(top: string[], body: string[], legs: string[], bob: boolean, palette: Record<string, string>) {
  const { canvas, ctx } = makeCanvas(CHAR_W, CHAR_H);
  const upper = [...HAT, ...top, ...body];
  for (const row of [...upper, ...legs]) {
    if (row.length !== CHAR_W) throw new Error(`Character row "${row}" must be ${CHAR_W} wide`);
  }
  drawRows(ctx, legs, palette, 0, 16);
  drawRows(ctx, upper, palette, 0, bob ? 1 : 0);
  return canvas;
}

/** Draws the full 12-frame sheet for one player color. */
export function drawCharacterSheet(colorIndex: number) {
  const color = PLAYER_COLORS[colorIndex];
  const pal = { ...BASE_PALETTE, c: color.main, C: color.shade };

  const down = [
    frame(FACE_DOWN, BODY_FRONT, LEGS_STAND, false, pal),
    frame(FACE_DOWN, BODY_FRONT, LEGS_STEP_A, true, pal),
    frame(FACE_DOWN, BODY_FRONT, LEGS_STEP_B, true, pal),
  ];
  const left = [
    frame(FACE_LEFT, BODY_SIDE, LEGS_SIDE_STAND, false, pal),
    frame(FACE_LEFT, BODY_SIDE, LEGS_SIDE_STRIDE, true, pal),
    frame(FACE_LEFT, BODY_SIDE, LEGS_SIDE_STRIDE, true, pal),
  ];
  const right = left.map(flipX);
  const up = [
    frame(HAIR_UP, BODY_FRONT, LEGS_STAND, false, pal),
    frame(HAIR_UP, BODY_FRONT, LEGS_STEP_A, true, pal),
    frame(HAIR_UP, BODY_FRONT, LEGS_STEP_B, true, pal),
  ];

  const frames = [...down, ...left, ...right, ...up];
  const { canvas, ctx } = makeCanvas(CHAR_W * CHAR_FRAMES, CHAR_H);
  frames.forEach((f, i) => ctx.drawImage(f, i * CHAR_W, 0));
  return canvas;
}

/** Soft oval shadow drawn under every character. */
export function drawShadow() {
  const { canvas, ctx } = makeCanvas(12, 5);
  ctx.globalAlpha = 0.35;
  ellipse(ctx, 6, 2.5, 6, 2.5, "#1a1110");
  return canvas;
}
