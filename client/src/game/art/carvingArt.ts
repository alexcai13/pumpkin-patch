import { CARVE_W, CARVE_H } from "../../../../shared/constants";
import { insidePumpkin } from "../../../../shared/carving";
import { P } from "./palette";

/**
 * Paints a carving onto a canvas at 1 pixel per carving cell (scale it up
 * with drawImage / setScale for a big view). Used by the carving screen and
 * the porch viewer so they always look the same.
 *
 * `lit` = the candle's on: the shell darkens like it's night and the carved
 * holes glow.
 */
export function paintCarving(ctx: CanvasRenderingContext2D, pixels: Uint8Array, lit: boolean) {
  ctx.clearRect(0, 0, CARVE_W, CARVE_H);
  const body = lit ? P.orangeDark : P.orange;
  const shade = lit ? "#7a3414" : P.orangeDark;
  for (let y = 0; y < CARVE_H; y++) {
    for (let x = 0; x < CARVE_W; x++) {
      if (!insidePumpkin(x, y)) continue;
      let color: string = body;
      if (pixels[y * CARVE_W + x]) color = lit ? (((x + y) % 3 === 0) ? "#fff4c2" : P.glow) : "#3a1a0e";
      else if (x === 8 || x === 16 || x === 24) color = shade; // ribs
      else if (!lit && y < 6 && x > 6 && x < 12) color = P.orangeLight; // shine
      else if (!insidePumpkin(x, y + 2) || !insidePumpkin(x + 2, y)) color = shade; // shading
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
}
