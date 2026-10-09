/**
 * Tiny helpers for drawing pixel art onto <canvas> elements in code.
 * All generated art goes through these, so it stays crisp (whole pixels only).
 */

export function makeCanvas(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

export type Ctx = CanvasRenderingContext2D;

/** Fill a rectangle of whole pixels. */
export function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function px(ctx: Ctx, x: number, y: number, color: string) {
  rect(ctx, x, y, 1, 1, color);
}

/** A filled pixel-ellipse (no anti-aliasing), centered at cx,cy. */
export function ellipse(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, color: string) {
  ctx.fillStyle = color;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) ctx.fillRect(x, y, 1, 1);
    }
  }
}

/**
 * Draw "string art": each string is one row of pixels, each character is a
 * color looked up in `palette`. "." (or any char missing from the palette) is
 * transparent. This makes small sprites easy to read and edit by hand.
 */
export function drawRows(ctx: Ctx, rows: string[], palette: Record<string, string>, ox = 0, oy = 0) {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = palette[row[x]];
      if (color) px(ctx, ox + x, oy + y, color);
    }
  });
}

/**
 * Deterministic random numbers. Same seed → same "random" art every time, so
 * the map looks identical for both players without sending any data.
 */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    // xorshift32
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** Stable hash of tile coordinates → 0..1, for picking tile variations. */
export function hash2(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Mirror a canvas horizontally (used for right-facing sprites). */
export function flipX(src: HTMLCanvasElement) {
  const { canvas, ctx } = makeCanvas(src.width, src.height);
  ctx.translate(src.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
  return canvas;
}
