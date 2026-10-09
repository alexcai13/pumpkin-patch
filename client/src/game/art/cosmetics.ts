import type * as Phaser from "phaser";
import { P } from "./palette";
import { makeCanvas, rect, px, ellipse } from "./pixels";
import { drawPumpkin, drawBigPumpkin, PUMPKIN_PALETTES } from "./props";

/**
 * PRIZE STAND COSMETICS (original art)
 * Hats are 18x14, drawn so their bottom edge sits on the top of a
 * character's head. Pumpkin colors reuse the pumpkin art with a different
 * palette (see PUMPKIN_PALETTES in props.ts).
 * Texture keys: `hat_<id>`, `pumpkin_<color>`, `pumpkin_big_<color>`.
 */
const HAT_W = 18, HAT_H = 14;

const HATS: Record<string, (ctx: CanvasRenderingContext2D) => void> = {
  leafcrown: (ctx) => {
    const colors = [P.orange, P.gold, P.red, P.orangeDark, P.gold];
    colors.forEach((c, i) => { const x = 2 + i * 3.2; ellipse(ctx, x + 1, 10 - (i % 2) * 2, 2, 2.6, P.outline); ellipse(ctx, x + 1, 10 - (i % 2) * 2, 1.3, 1.9, c); });
    rect(ctx, 2, 11, 14, 1, P.woodDark);
  },
  flowercrown: (ctx) => {
    rect(ctx, 2, 11, 14, 1, P.leafGreenDark);
    const colors = [P.plum, P.cream, P.gold, P.red, P.cream];
    colors.forEach((c, i) => { const x = 3 + i * 3; ellipse(ctx, x, 10, 1.9, 1.9, c); px(ctx, x, 10, P.goldLight); });
  },
  pumpkincap: (ctx) => {
    ellipse(ctx, 9, 9, 7.5, 4.5, P.outline); ellipse(ctx, 9, 9, 6.5, 3.6, P.orange);
    for (const x of [5, 9, 13]) rect(ctx, x, 6, 1, 6, P.orangeDark);
    ellipse(ctx, 6, 7.5, 1.6, 1, P.orangeLight);
    rect(ctx, 8, 2, 2, 4, P.outline); rect(ctx, 8.5, 2, 1, 3, P.stem); rect(ctx, 10, 3, 3, 1, P.leafGreen);
  },
  strawhat: (ctx) => {
    ellipse(ctx, 9, 11, 9, 2.6, P.outline); ellipse(ctx, 9, 11, 8, 1.8, P.hay);
    rect(ctx, 4, 4, 10, 7, P.outline); rect(ctx, 5, 5, 8, 6, P.hayDark);
    rect(ctx, 5, 8, 8, 2, P.red);
    for (let x = 6; x < 13; x += 2) px(ctx, x, 6, P.hay);
  },
  witchhat: (ctx) => {
    ellipse(ctx, 9, 11.5, 9, 2.2, P.outline); ellipse(ctx, 9, 11.5, 8, 1.5, P.plumDark);
    for (let y = 0; y < 10; y++) { const half = Math.max(1, (y / 10) * 5); rect(ctx, 9 - half + (10 - y) * 0.3, y, half * 2, 1, y < 1 ? P.outline : P.plum); }
    rect(ctx, 4, 8, 10, 2, P.gold); rect(ctx, 8, 8, 2, 2, P.goldDark);
  },
  tophat: (ctx) => {
    ellipse(ctx, 9, 12, 8, 2, P.outline); ellipse(ctx, 9, 12, 7, 1.3, "#2b2440");
    rect(ctx, 4, 1, 10, 11, P.outline); rect(ctx, 5, 2, 8, 9, "#2b2440");
    rect(ctx, 5, 8, 8, 2, P.orange); px(ctx, 6, 3, "#5a5280");
  },
};

/** Creates any cosmetic textures that don't exist yet (cheap; done once). */
export function ensureCosmeticTextures(scene: Phaser.Scene) {
  for (const [id, draw] of Object.entries(HATS)) {
    const key = `hat_${id}`;
    if (scene.textures.exists(key)) continue;
    const { canvas, ctx } = makeCanvas(HAT_W, HAT_H);
    draw(ctx);
    scene.textures.addCanvas(key, canvas);
  }
  for (const [color, pal] of Object.entries(PUMPKIN_PALETTES)) {
    if (!scene.textures.exists(`pumpkin_${color}`)) scene.textures.addCanvas(`pumpkin_${color}`, drawPumpkin(pal));
    if (!scene.textures.exists(`pumpkin_big_${color}`)) scene.textures.addCanvas(`pumpkin_big_${color}`, drawBigPumpkin(pal));
  }
}
