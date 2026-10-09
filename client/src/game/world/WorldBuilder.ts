import * as Phaser from "phaser";
import { TILE } from "../../../../shared/constants";
import { LEGEND, type GroundKind, type MapDef } from "../../../../shared/map/legend";
import { GROUND_ROWS, EDGED_KINDS, PLAIN_VARIANTS, TILESET_COLS, sameGroup } from "../art/tiles";
import { objectTextureKey, PROP_ART } from "../art/props";
import { propTextureKey } from "../art/ArtLoader";
import { hash2 } from "../art/pixels";
import { FONT } from "../ui/fonts";
import { OVERLAY_DEPTH } from "../objects/Character";

/**
 * Turns a MapDef (shared/map/*.ts) into things on screen:
 *  - one Phaser tilemap layer for the ground (fast: drawn as a single batch)
 *  - one image per tree/fence/hay/etc., Y-sorted so players walk behind them
 *  - one image per multi-tile prop, plus its label
 *
 * It's reusable: the corn maze map in phase 4 will use it too.
 */
export class WorldBuilder {
  readonly widthPx: number;
  readonly heightPx: number;
  /** Text labels (rendered at camera zoom for crispness). */
  readonly labels: Phaser.GameObjects.Text[] = [];
  /** Prop images by prop id, so later phases can animate them (the wagon!). */
  readonly propImages = new Map<string, Phaser.GameObjects.Image>();
  /** Jack-o'-lantern images (DayCycle lights them up at dusk). */
  readonly lanterns: Phaser.GameObjects.Image[] = [];

  constructor(private scene: Phaser.Scene, private map: MapDef) {
    this.widthPx = map.rows[0].length * TILE;
    this.heightPx = map.rows.length * TILE;
  }

  build() {
    this.buildGround();
    this.buildTileObjects();
    this.buildProps();
    return this;
  }

  private groundAt(tx: number, ty: number): GroundKind | null {
    const ch = this.map.rows[ty]?.[tx];
    return ch === undefined ? null : LEGEND[ch].ground;
  }

  private buildGround() {
    const rows = this.map.rows;
    const data: number[][] = rows.map((row, ty) =>
      [...row].map((_, tx) => {
        const kind = this.groundAt(tx, ty)!;
        const rowIndex = GROUND_ROWS.indexOf(kind);
        let col: number;
        if (EDGED_KINDS.has(kind)) {
          // Edge mask: which neighbors are a different kind (see art/tiles.ts).
          const differs = (nx: number, ny: number) => {
            const n = this.groundAt(nx, ny);
            return n !== null && !sameGroup(kind, n);
          };
          col = (differs(tx, ty - 1) ? 1 : 0) | (differs(tx + 1, ty) ? 2 : 0) |
                (differs(tx, ty + 1) ? 4 : 0) | (differs(tx - 1, ty) ? 8 : 0);
        } else {
          col = Math.floor(hash2(tx, ty) * PLAIN_VARIANTS);
        }
        return rowIndex * TILESET_COLS + col;
      }),
    );

    const tilemap = this.scene.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
    const tileset = tilemap.addTilesetImage("tileset", "tileset", TILE, TILE, 0, 0)!;
    tilemap.createLayer(0, tileset, 0, 0)!.setDepth(0);
  }

  private buildTileObjects() {
    this.map.rows.forEach((row, ty) => {
      for (let tx = 0; tx < row.length; tx++) {
        const info = LEGEND[row[tx]];
        if (!info.object) continue;
        const key = objectTextureKey(info.object, tx, ty, hash2(tx * 7, ty * 3));
        // Bottom-center of the sprite sits at the bottom-center of its tile.
        const img = this.scene.add.image(tx * TILE + TILE / 2, (ty + 1) * TILE, key)
          .setOrigin(0.5, 1)
          // Y-sort: a hair less than a character standing on the same row,
          // so the character beside it draws in front.
          .setDepth(ty * TILE + TILE / 2 - 0.1);
        if (info.object === "lantern") this.lanterns.push(img);
      }
    });
  }

  private buildProps() {
    for (const prop of this.map.props) {
      const art = PROP_ART[prop.type];
      const depthRow = art.depthRow ?? prop.h - 1;
      const img = this.scene.add.image(prop.x * TILE, (prop.y + prop.h) * TILE, propTextureKey(prop.type))
        .setOrigin(0, 1)
        .setDepth((prop.y + depthRow) * TILE + TILE / 2 - 0.1);
      this.propImages.set(prop.id, img);

      if (prop.label) {
        const label = this.scene.add.text(
          (prop.x + prop.w / 2) * TILE, img.y - img.height - 1, prop.label,
          { fontFamily: FONT, fontSize: "7px", color: "#f1e3c2", stroke: "#2a1a14", strokeThickness: 3 },
        ).setOrigin(0.5, 1).setDepth(OVERLAY_DEPTH - 1);
        this.labels.push(label);
      }
    }
  }
}
