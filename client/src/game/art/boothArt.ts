import { P } from "./palette";
import { rng } from "./pixels";
import { FONT } from "../ui/fonts";

/**
 * PHOTO BOOTH ART: the finished 4-photo strip and its fall-decorated border
 * (plaid card, leaf garland, pumpkins, acorns). Everything is drawn with
 * canvas shapes, so there are no image files to load.
 */

/** Size of one person's half of a photo (4:3). */
export const HALF_W = 240;
export const HALF_H = 180;
/** Width of the cream divider between the two halves. */
export const DIVIDER = 4;
export const FRAME_W = HALF_W * 2 + DIVIDER;

type Ctx = CanvasRenderingContext2D;

function outlined(ctx: Ctx, fill: string, width = 4) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = width;
  ctx.strokeStyle = P.outline;
  ctx.stroke();
}

function leafShape(ctx: Ctx, x: number, y: number, size: number, angle: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.ellipse(0, 0, size, size * 0.55, 0, 0, Math.PI * 2);
  outlined(ctx, color, Math.max(2, size * 0.15));
  ctx.beginPath();
  ctx.moveTo(-size, 0); ctx.lineTo(size * 0.8, 0);
  ctx.lineWidth = Math.max(1, size * 0.1);
  ctx.strokeStyle = P.woodDark;
  ctx.stroke();
  ctx.restore();
}

/**
 * Copy a video frame into (x, y, w, h), cropped to fill (like CSS
 * object-fit: cover). The live preview is mirrored like a selfie, but saved
 * photos are not (mirror = false) — same as a phone camera — so any writing
 * on a shirt reads the right way.
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
    const scale = Math.floor((h * 0.7) / character.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(character, x + (w - character.width * scale) / 2, y + h * 0.12, character.width * scale, character.height * scale);
  }
  ctx.font = `bold ${Math.round(h * 0.09)}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillStyle = P.cream;
  ctx.fillText(name, x + w / 2, y + h * 0.95);
}

function pumpkin(ctx: Ctx, x: number, y: number, r: number) {
  for (const [dx, color] of [[-0.5, P.orangeDark], [0.5, P.orangeDark], [0, P.orange]] as const) {
    ctx.beginPath();
    ctx.ellipse(x + dx * r, y, r * 0.62, r * 0.8, 0, 0, Math.PI * 2);
    outlined(ctx, color, 3);
  }
  ctx.beginPath();
  ctx.ellipse(x - r * 0.25, y - r * 0.3, r * 0.15, r * 0.22, -0.3, 0, Math.PI * 2);
  ctx.fillStyle = P.orangeLight;
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(x - r * 0.1, y - r * 1.15, r * 0.2, r * 0.45, 2);
  outlined(ctx, P.stem, 2);
  leafShape(ctx, x + r * 0.35, y - r * 0.95, r * 0.28, -0.5, P.leafGreen);
}

function acorn(ctx: Ctx, x: number, y: number, r: number, angle: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath(); ctx.ellipse(0, r * 0.35, r * 0.6, r * 0.75, 0, 0, Math.PI * 2); outlined(ctx, P.woodLight, 2);
  ctx.beginPath(); ctx.ellipse(0, -r * 0.2, r * 0.75, r * 0.4, 0, 0, Math.PI * 2); outlined(ctx, P.woodDark, 2);
  ctx.fillStyle = P.woodDeep; ctx.fillRect(-1, -r * 0.85, 2, r * 0.35);
  ctx.restore();
}

/** Brown-and-orange flannel plaid, like a cozy autumn shirt. */
function plaid(ctx: Ctx, W: number, H: number) {
  ctx.fillStyle = P.orangeDark;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = P.redDark;
  for (let x = 0; x < W; x += 48) ctx.fillRect(x, 0, 18, H);
  for (let y = 0; y < H; y += 48) ctx.fillRect(0, y, W, 18);
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = P.goldLight;
  for (let x = 30; x < W; x += 48) ctx.fillRect(x, 0, 3, H);
  for (let y = 30; y < H; y += 48) ctx.fillRect(0, y, W, 3);
  ctx.globalAlpha = 1;
}

/** A string of leaves swooping across the top. */
function garland(ctx: Ctx, x0: number, x1: number, y: number, sag: number) {
  const point = (t: number) => ({ x: x0 + (x1 - x0) * t, y: y + Math.sin(t * Math.PI) * sag });
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) { const p = point(i / 40); if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
  ctx.lineWidth = 3;
  ctx.strokeStyle = P.woodDeep;
  ctx.stroke();
  const colors = [P.gold, P.red, P.orangeLight, P.redDark, P.goldLight];
  for (let i = 1; i < 16; i++) {
    const p = point(i / 16);
    leafShape(ctx, p.x, p.y + 7, 8, Math.PI / 2 + (i % 2 ? 0.4 : -0.4), colors[i % colors.length]);
  }
}

/** Lay out the 4 photos in a fall-themed strip. Returns the finished canvas. */
export function buildStrip(frames: HTMLCanvasElement[], names: string[], date: Date) {
  const pad = 36, gap = 16, header = 104, footer = 84, border = 6;
  const W = FRAME_W + pad * 2;
  const H = header + frames.length * (HALF_H + gap) - gap + footer;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.lineJoin = "round";

  // Card: plaid with a wooden frame.
  plaid(ctx, W, H);
  ctx.lineWidth = border * 2;
  ctx.strokeStyle = P.woodDark;
  ctx.strokeRect(0, 0, W, H);
  ctx.lineWidth = 2;
  ctx.strokeStyle = P.woodLight;
  ctx.strokeRect(border + 1, border + 1, W - border * 2 - 2, H - border * 2 - 2);

  // Leaves and acorns tumbling down both side margins (same layout every time).
  const r = rng(77);
  const leafColors = [P.gold, P.red, P.goldLight, P.redDark, P.orangeLight, P.leafGreen];
  for (let i = 0; i < 46; i++) {
    const left = i % 2 === 0;
    const lx = left ? 10 + r() * (pad - 16) : W - 10 - r() * (pad - 16);
    const ly = header + r() * (H - header - footer);
    if (i % 7 === 3) acorn(ctx, lx, ly, 7, r() * 1.2 - 0.6);
    else leafShape(ctx, lx, ly, 7 + r() * 5, r() * Math.PI * 2, leafColors[i % leafColors.length]);
  }

  // Header: leaf garland + title with pumpkins either side.
  garland(ctx, 14, W - 14, 16, 14);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold 30px ${FONT}`;
  ctx.lineWidth = 7;
  ctx.strokeStyle = P.outline;
  ctx.strokeText("Pumpkin Patch Pals", W / 2, 66);
  ctx.fillStyle = P.cream;
  ctx.fillText("Pumpkin Patch Pals", W / 2, 66);
  pumpkin(ctx, 40, 70, 17);
  pumpkin(ctx, W - 40, 70, 17);

  // The photos, each with a cream "print" border and a little shadow.
  frames.forEach((frame, i) => {
    const fy = header + i * (HALF_H + gap);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(pad - 1, fy + 1, FRAME_W + 10, HALF_H + 10);
    ctx.fillStyle = P.cream;
    ctx.fillRect(pad - 5, fy - 5, FRAME_W + 10, HALF_H + 10);
    ctx.drawImage(frame, pad, fy);
  });

  // Footer: a pumpkin patch along the bottom, names and date.
  const fy = H - footer;
  for (const [x, size] of [[34, 20], [70, 14], [W - 70, 14], [W - 34, 20]] as const) pumpkin(ctx, x, fy + 52, size);
  leafShape(ctx, 100, fy + 64, 9, 0.3, P.red);
  leafShape(ctx, W - 100, fy + 64, 9, -0.3, P.gold);
  const when = date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  ctx.font = `bold 20px ${FONT}`;
  ctx.lineWidth = 6;
  const text = names.join(" & ");
  ctx.strokeText(text, W / 2, fy + 34);
  ctx.fillStyle = P.cream;
  ctx.fillText(text, W / 2, fy + 34);
  ctx.font = `14px ${FONT}`;
  ctx.lineWidth = 5;
  ctx.strokeText(when, W / 2, fy + 60);
  ctx.fillStyle = P.goldLight;
  ctx.fillText(when, W / 2, fy + 60);
  return canvas;
}
