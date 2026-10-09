import { P } from "./palette";
import { rng } from "./pixels";
import { FONT } from "../ui/fonts";

/**
 * PHOTO BOOTH ART
 * ---------------
 * The finished photo strip: a tall, narrow card with 3 photos, fall
 * decorations (maple leaves, pumpkins, acorns, vines) spilling over the photo
 * corners, and the two names + the date handwritten at the bottom.
 * Three styles (STRIP_THEMES) can be switched after the shoot.
 * Everything is drawn with canvas shapes, so there are no image files.
 */

/** One person's half of a photo: a portrait crop (3:4). */
export const HALF_W = 300;
export const HALF_H = 400;
/** Gap between the two halves (0 = the two people sit seamlessly side by side). */
export const DIVIDER = 0;
/** A full photo = two halves side by side. */
export const FRAME_W = HALF_W * 2 + DIVIDER;

/** The handwritten font for captions (loaded in index.html). */
export const SCRIPT_FONT = '"Dancing Script", cursive';

export const STRIP_THEMES = ["Harvest", "Maple", "Pumpkin"] as const;
export type StripTheme = (typeof STRIP_THEMES)[number];

type Ctx = CanvasRenderingContext2D;

// ------------------------------------------------------------------ camera helpers

/**
 * Copy a video frame into (x, y, w, h), cropped to fill (like CSS
 * object-fit: cover). mirror = true flips it like a selfie, matching the
 * live preview (that's what the photo booth saves).
 */
export function drawVideoCover(ctx: Ctx, video: HTMLVideoElement, x: number, y: number, w: number, h: number, mirror = false) {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return false;
  const scale = Math.max(w / vw, h / vh);
  const sw = w / scale, sh = h / scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  if (mirror) {
    ctx.translate(x + w, y);
    ctx.scale(-1, 1);
  } else {
    ctx.translate(x, y);
  }
  ctx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, w, h);
  ctx.restore();
  return true;
}

/**
 * Stand-in for someone without a camera (or not in the booth): their game
 * character, big, on a dusky background.
 */
export function drawCharacterStandIn(ctx: Ctx, character: HTMLCanvasElement | null, name: string, x: number, y: number, w: number, h: number) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, P.dusk);
  g.addColorStop(1, P.plumDark);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  if (character) {
    const scale = Math.floor(Math.min((h * 0.65) / character.height, (w * 0.8) / character.width));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(character, x + (w - character.width * scale) / 2, y + h * 0.12, character.width * scale, character.height * scale);
  }
  ctx.font = `bold ${Math.round(h * 0.07)}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillStyle = P.cream;
  ctx.fillText(name, x + w / 2, y + h * 0.93);
}

// ------------------------------------------------------------------ decorations

/** A maple leaf (5 pointed lobes), centered at x,y. */
function mapleLeaf(ctx: Ctx, x: number, y: number, size: number, angle: number, color: string, vein = P.woodDark) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  // Points around the leaf: alternating tips (far) and notches (near).
  const tips = [
    [0, -1], [0.18, -0.55], [0.55, -0.75], [0.42, -0.3], [0.95, -0.25], [0.5, 0.05],
    [0.7, 0.45], [0.2, 0.3], [0.06, 0.55],
  ];
  const pts = [...tips, ...tips.slice(0, -1).reverse().map(([px, py]) => [-px, py])];
  pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px * size, py * size) : ctx.lineTo(px * size, py * size)));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, size * 0.06);
  ctx.strokeStyle = "rgba(60, 25, 10, 0.55)";
  ctx.stroke();
  // Stem + veins
  ctx.beginPath();
  ctx.moveTo(0, size * 1.05); ctx.lineTo(0, -size * 0.7);
  ctx.moveTo(0, 0); ctx.lineTo(size * 0.6, -size * 0.45);
  ctx.moveTo(0, 0); ctx.lineTo(-size * 0.6, -size * 0.45);
  ctx.moveTo(0, size * 0.15); ctx.lineTo(size * 0.45, size * 0.3);
  ctx.moveTo(0, size * 0.15); ctx.lineTo(-size * 0.45, size * 0.3);
  ctx.lineWidth = Math.max(1, size * 0.05);
  ctx.strokeStyle = vein;
  ctx.stroke();
  ctx.restore();
}

/** A simple oval leaf (birch / elm). */
function ovalLeaf(ctx: Ctx, x: number, y: number, size: number, angle: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(-size, 0);
  ctx.quadraticCurveTo(0, -size * 0.6, size, 0);
  ctx.quadraticCurveTo(0, size * 0.6, -size, 0);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = Math.max(1, size * 0.08);
  ctx.strokeStyle = "rgba(60, 25, 10, 0.5)";
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-size * 1.2, 0); ctx.lineTo(size * 0.8, 0);
  ctx.stroke();
  ctx.restore();
}

function pumpkin(ctx: Ctx, x: number, y: number, r: number) {
  const lobes: [number, string][] = [[-0.55, P.orangeDark], [0.55, P.orangeDark], [0, P.orange]];
  for (const [dx, color] of lobes) {
    ctx.beginPath();
    ctx.ellipse(x + dx * r, y, r * 0.62, r * 0.78, 0, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = Math.max(2, r * 0.06);
    ctx.strokeStyle = "#7a3414";
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.ellipse(x - r * 0.22, y - r * 0.3, r * 0.12, r * 0.22, -0.3, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255, 220, 160, 0.6)";
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - r * 0.06, y - r * 0.7);
  ctx.quadraticCurveTo(x - r * 0.1, y - r * 1.1, x + r * 0.15, y - r * 1.2);
  ctx.lineWidth = r * 0.16;
  ctx.lineCap = "round";
  ctx.strokeStyle = P.stem;
  ctx.stroke();
  ctx.lineCap = "butt";
  ovalLeaf(ctx, x + r * 0.45, y - r * 0.95, r * 0.32, -0.4, P.leafGreen);
}

function acorn(ctx: Ctx, x: number, y: number, r: number, angle: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath(); ctx.ellipse(0, r * 0.4, r * 0.62, r * 0.78, 0, 0, Math.PI * 2);
  ctx.fillStyle = P.woodLight; ctx.fill();
  ctx.beginPath(); ctx.ellipse(0, -r * 0.15, r * 0.78, r * 0.42, 0, 0, Math.PI * 2);
  ctx.fillStyle = P.woodDark; ctx.fill();
  ctx.fillStyle = P.woodDeep; ctx.fillRect(-r * 0.08, -r * 0.85, r * 0.16, r * 0.4);
  ctx.restore();
}

function berries(ctx: Ctx, x: number, y: number, r: number) {
  for (const [dx, dy] of [[0, 0], [r * 1.6, -r * 0.6], [r * 0.9, r * 1.3]]) {
    ctx.beginPath();
    ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
    ctx.fillStyle = P.red;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + dx - r * 0.3, y + dy - r * 0.3, r * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fill();
  }
}

const AUTUMN = [P.orange, P.red, P.gold, P.orangeDark, P.redDark, "#d9822b", P.goldDark];

/**
 * A fan of leaves (plus an acorn or berries) anchored at a photo corner.
 * `dir` points the fan outward: angle in radians.
 */
function leafCluster(ctx: Ctx, x: number, y: number, size: number, dir: number, seed: number) {
  const r = rng(seed);
  for (let i = 0; i < 5; i++) {
    const a = dir + (i - 2) * 0.45 + (r() - 0.5) * 0.2;
    const d = size * (0.55 + r() * 0.35);
    const color = AUTUMN[Math.floor(r() * AUTUMN.length)];
    const lx = x + Math.cos(a) * d, ly = y + Math.sin(a) * d;
    if (i % 2 === 0) mapleLeaf(ctx, lx, ly, size * (0.55 + r() * 0.25), a + Math.PI / 2, color);
    else ovalLeaf(ctx, lx, ly, size * (0.45 + r() * 0.2), a, color);
  }
  if (r() < 0.5) acorn(ctx, x, y, size * 0.28, dir);
  else berries(ctx, x, y, size * 0.12);
}

/** A curly vine from (x0,y0) to (x1,y1) with little leaves along it. */
function vine(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, seed: number) {
  const r = rng(seed);
  const cx = (x0 + x1) / 2 + (r() - 0.5) * 80, cy = (y0 + y1) / 2 + (r() - 0.5) * 40;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(cx, cy, x1, y1);
  ctx.lineWidth = 4;
  ctx.strokeStyle = P.leafGreenDark;
  ctx.stroke();
  for (let t = 0.15; t < 0.95; t += 0.18) {
    const px = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1;
    const py = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1;
    ovalLeaf(ctx, px + 8, py - 6, 13, -0.6 + r(), r() < 0.5 ? P.leafGreen : P.gold);
    // Curl
    ctx.beginPath();
    ctx.arc(px - 8, py + 8, 7, 0, Math.PI * 1.5);
    ctx.lineWidth = 2;
    ctx.strokeStyle = P.leafGreenDark;
    ctx.stroke();
  }
}

/** Leaves scattered loosely over the card (and partly over photos). */
function scatterLeaves(ctx: Ctx, W: number, H: number, count: number, seed: number, maxSize: number) {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    // Mostly near the left/right edges, so faces stay clear.
    const edge = r() < 0.5 ? r() * 70 : W - r() * 70;
    const color = AUTUMN[Math.floor(r() * AUTUMN.length)];
    const size = maxSize * (0.45 + r() * 0.55);
    if (r() < 0.6) mapleLeaf(ctx, edge, r() * H, size, r() * Math.PI * 2, color);
    else ovalLeaf(ctx, edge, r() * H, size * 0.8, r() * Math.PI * 2, color);
  }
}

// ------------------------------------------------------------------ frame shapes

function roundedPath(ctx: Ctx, x: number, y: number, w: number, h: number, radius: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
}

/** A pumpkin outline: wide rounded body with a scalloped top and a stem. */
function pumpkinPath(ctx: Ctx, x: number, y: number, w: number, h: number) {
  const cx = x + w / 2;
  ctx.beginPath();
  ctx.moveTo(cx, y + h * 0.08);
  ctx.bezierCurveTo(cx + w * 0.18, y - h * 0.04, cx + w * 0.42, y + h * 0.0, cx + w * 0.48, y + h * 0.22);
  ctx.bezierCurveTo(cx + w * 0.56, y + h * 0.5, cx + w * 0.52, y + h * 0.86, cx + w * 0.3, y + h * 0.98);
  ctx.bezierCurveTo(cx + w * 0.15, y + h * 1.04, cx - w * 0.15, y + h * 1.04, cx - w * 0.3, y + h * 0.98);
  ctx.bezierCurveTo(cx - w * 0.52, y + h * 0.86, cx - w * 0.56, y + h * 0.5, cx - w * 0.48, y + h * 0.22);
  ctx.bezierCurveTo(cx - w * 0.42, y + h * 0.0, cx - w * 0.18, y - h * 0.04, cx, y + h * 0.08);
  ctx.closePath();
}

// ------------------------------------------------------------------ the strip

interface ThemeStyle {
  bg: string;
  bg2: string;
  /** Border around each photo. */
  frame: string;
  caption: string;
  subCaption: string;
  shape: "rounded" | "square" | "pumpkin";
}

const THEMES: Record<StripTheme, ThemeStyle> = {
  Harvest: { bg: "#f6ecd8", bg2: "#ecdcbc", frame: P.orange, caption: P.orangeDark, subCaption: P.woodDark, shape: "rounded" },
  Maple: { bg: "#5a3420", bg2: "#3f2416", frame: P.cream, caption: P.cream, subCaption: P.goldLight, shape: "square" },
  Pumpkin: { bg: "#f8efdc", bg2: "#f0e2c4", frame: P.orange, caption: P.orangeDark, subCaption: P.woodDark, shape: "pumpkin" },
};

/**
 * Lay out the photos in a tall fall photo strip. `frames` are the raw
 * photos (FRAME_W x HALF_H, both halves). Returns the finished canvas.
 */
export function buildStrip(frames: HTMLCanvasElement[], names: string[], date: Date, theme: StripTheme = "Harvest") {
  const t = THEMES[theme];
  const margin = 56;           // sides
  const top = 60;
  const gap = theme === "Pumpkin" ? 70 : 44;
  const captionH = 210;
  const photoW = FRAME_W, photoH = HALF_H;
  const W = photoW + margin * 2;
  const H = top + frames.length * photoH + (frames.length - 1) * gap + captionH;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.lineJoin = "round";

  // Card background: soft gradient + faint paper speckles.
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, t.bg);
  bg.addColorStop(1, t.bg2);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const speck = rng(5);
  ctx.fillStyle = theme === "Maple" ? "rgba(255,255,255,0.04)" : "rgba(120,70,30,0.06)";
  for (let i = 0; i < 400; i++) ctx.fillRect(speck() * W, speck() * H, 2, 2);

  // Background leaves (behind photos) for the Maple theme.
  if (theme === "Maple") scatterLeaves(ctx, W, H, 26, 11, 34);

  // Photos.
  const photoY = (i: number) => top + i * (photoH + gap);
  frames.forEach((frame, i) => {
    const x = margin, y = photoY(i);
    ctx.save();
    // Soft drop shadow
    ctx.shadowColor = "rgba(40, 20, 10, 0.35)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 5;
    if (t.shape === "pumpkin") pumpkinPath(ctx, x - 6, y - 6, photoW + 12, photoH + 12);
    else roundedPath(ctx, x - 8, y - 8, photoW + 16, photoH + 16, t.shape === "rounded" ? 30 : 4);
    ctx.fillStyle = t.frame;
    ctx.fill();
    ctx.restore();

    ctx.save();
    if (t.shape === "pumpkin") pumpkinPath(ctx, x + 4, y + 4, photoW - 8, photoH - 8);
    else roundedPath(ctx, x, y, photoW, photoH, t.shape === "rounded" ? 22 : 2);
    ctx.clip();
    ctx.drawImage(frame, x, y);
    ctx.restore();

    if (t.shape === "pumpkin") {
      // Stem on top of each pumpkin frame, with a curly vine down to the next one.
      ctx.beginPath();
      ctx.moveTo(x + photoW / 2 - 6, y + 6);
      ctx.quadraticCurveTo(x + photoW / 2 - 14, y - 30, x + photoW / 2 + 18, y - 42);
      ctx.lineWidth = 16;
      ctx.lineCap = "round";
      ctx.strokeStyle = P.stem;
      ctx.stroke();
      ctx.lineCap = "butt";
      ovalLeaf(ctx, x + photoW / 2 + 40, y - 30, 22, -0.3, P.leafGreen);
    }
  });

  // Pumpkin theme: curly vines linking each pumpkin to the next, drawn over
  // the photos so they read as one continuous patch.
  if (theme === "Pumpkin") {
    for (let i = 0; i < frames.length - 1; i++) {
      const y = photoY(i);
      vine(ctx, margin + photoW - 40, y + photoH - 30, margin + photoW - 20, photoY(i + 1) + 40, 30 + i);
      vine(ctx, margin + 50, y + photoH - 10, margin + 30, photoY(i + 1) + 60, 40 + i);
    }
  }

  // Decorations that overlap the photo corners (drawn on top).
  frames.forEach((_, i) => {
    const y = photoY(i);
    const leftX = margin, rightX = margin + photoW;
    if (theme === "Harvest") {
      // Alternate corners so it feels hand-placed.
      // Anchored just inside the corner, so leaves spill over the photo.
      if (i % 2 === 0) leafCluster(ctx, rightX - 34, y + 30, 72, -Math.PI / 4, 100 + i);
      else leafCluster(ctx, leftX + 34, y + 30, 72, -Math.PI * 0.75, 100 + i);
      if (i === frames.length - 1) leafCluster(ctx, rightX - 34, y + photoH - 28, 62, Math.PI / 4, 200);
    } else if (theme === "Maple") {
      leafCluster(ctx, leftX + 30, y + 28, 66, -Math.PI * 0.75, 300 + i);
      leafCluster(ctx, rightX - 30, y + photoH - 26, 66, Math.PI / 4, 400 + i);
    } else {
      if (i % 2 === 1) leafCluster(ctx, leftX + 46, y + photoH - 46, 60, Math.PI * 0.75, 500 + i);
      else leafCluster(ctx, rightX - 46, y + 50, 52, -Math.PI / 4, 550 + i);
    }
  });
  if (theme !== "Maple") scatterLeaves(ctx, W, H - captionH, 14, 21 + STRIP_THEMES.indexOf(theme), 26);

  // Caption area: pumpkins in the corners, the two names and the date.
  const capY = H - captionH;
  pumpkin(ctx, 74, capY + 138, 40);
  pumpkin(ctx, 128, capY + 166, 26);
  pumpkin(ctx, W - 80, capY + 146, 34);
  leafCluster(ctx, W - 130, capY + 170, 46, -Math.PI / 2, 600);
  acorn(ctx, 170, capY + 180, 12, 0.4);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = t.caption;
  ctx.font = `700 64px ${SCRIPT_FONT}`;
  ctx.fillText(names.join(" & "), W / 2, capY + 82);
  const when = date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  ctx.fillStyle = t.subCaption;
  ctx.font = `600 28px ${SCRIPT_FONT}`;
  ctx.fillText(when, W / 2, capY + 140);
  return canvas;
}
