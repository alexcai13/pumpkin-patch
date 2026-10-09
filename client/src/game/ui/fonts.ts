/**
 * The pixel font, loaded from Google Fonts in index.html. If it can't load
 * (offline), the browser falls back to a monospace font and everything still works.
 */
export const FONT = '"Pixelify Sans", "Courier New", monospace';

/** Waits (briefly) for the web font so Phaser text doesn't render with the fallback. */
export async function loadFonts() {
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('16px "Pixelify Sans"'),
        document.fonts.load('bold 16px "Pixelify Sans"'),
      ]),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ]);
  } catch {
    // Ignore: fall back to monospace.
  }
}
