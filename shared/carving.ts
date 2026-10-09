import { CARVE_W, CARVE_H } from "./constants.js";

/**
 * A carving is a CARVE_W x CARVE_H grid of on/off pixels ("cut out" or not).
 * To send it over the network compactly we pack 8 pixels per byte and
 * base64 the bytes: 32x24 pixels → 96 bytes → a 128-character string.
 */
export const CARVE_BYTES = (CARVE_W * CARVE_H) / 8;
export const CARVE_MASK_LENGTH = Math.ceil(CARVE_BYTES / 3) * 4;

export function encodeCarving(pixels: Uint8Array): string {
  const bytes = new Uint8Array(CARVE_BYTES);
  for (let i = 0; i < CARVE_W * CARVE_H; i++) {
    if (pixels[i]) bytes[i >> 3] |= 1 << (i & 7);
  }
  let binary = "";
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

export function decodeCarving(mask: string): Uint8Array {
  const pixels = new Uint8Array(CARVE_W * CARVE_H);
  const binary = atob(mask);
  for (let i = 0; i < CARVE_W * CARVE_H; i++) {
    if (binary.charCodeAt(i >> 3) & (1 << (i & 7))) pixels[i] = 1;
  }
  return pixels;
}

/** True if a string looks like a valid encoded carving. */
export function isValidCarving(mask: unknown): mask is string {
  return typeof mask === "string" && mask.length === CARVE_MASK_LENGTH && /^[A-Za-z0-9+/]+=*$/.test(mask);
}

/**
 * The pumpkin's outline on the carving grid: you can only carve inside it.
 * An ellipse leaving a 1-pixel margin.
 */
export function insidePumpkin(x: number, y: number) {
  const dx = (x + 0.5 - CARVE_W / 2) / (CARVE_W / 2 - 1);
  const dy = (y + 0.5 - CARVE_H / 2) / (CARVE_H / 2 - 1);
  return dx * dx + dy * dy <= 1;
}
