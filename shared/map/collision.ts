import { LEGEND, type MapDef } from "./legend.js";

/**
 * A walkability grid built from a map: `blocked[ty * width + tx] === 1` means
 * that tile can't be walked on. Built once, then looked up cheaply every step.
 *
 * Used by the client (to stop your own character) and by the server (to
 * sanity-check positions players report).
 */
export class CollisionGrid {
  readonly width: number;
  readonly height: number;
  private readonly blocked: Uint8Array;

  constructor(map: MapDef) {
    this.height = map.rows.length;
    this.width = map.rows[0].length;
    this.blocked = new Uint8Array(this.width * this.height);

    // 1) Tiles from the character grid.
    map.rows.forEach((row, ty) => {
      if (row.length !== this.width) {
        throw new Error(`Map row ${ty} is ${row.length} chars long, expected ${this.width}`);
      }
      for (let tx = 0; tx < row.length; tx++) {
        const info = LEGEND[row[tx]];
        if (!info) throw new Error(`Unknown map character "${row[tx]}" at ${tx},${ty}`);
        if (info.blocks) this.setBlocked(tx, ty, true);
      }
    });

    // 2) Footprints of multi-tile props.
    for (const prop of map.props) {
      for (let dy = 0; dy < prop.h; dy++) {
        for (let dx = 0; dx < prop.w; dx++) {
          const solid =
            prop.solid === "all" ? true :
            prop.solid === "none" ? false :
            prop.solid[dy]?.[dx] === "x";
          if (solid) this.setBlocked(prop.x + dx, prop.y + dy, true);
        }
      }
    }
  }

  setBlocked(tx: number, ty: number, value: boolean) {
    if (!this.inBounds(tx, ty)) return;
    this.blocked[ty * this.width + tx] = value ? 1 : 0;
  }

  inBounds(tx: number, ty: number) {
    return tx >= 0 && ty >= 0 && tx < this.width && ty < this.height;
  }

  /** Out-of-bounds counts as blocked, so nobody walks off the map. */
  isBlocked(tx: number, ty: number) {
    if (!this.inBounds(tx, ty)) return true;
    return this.blocked[ty * this.width + tx] === 1;
  }
}
