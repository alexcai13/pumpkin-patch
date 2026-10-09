import { Scene } from "phaser";
import { generateMissingTextures, queueManifestOverrides } from "../art/ArtLoader";

/**
 * Loads any real image files listed in public/assets/manifest.json, then
 * draws every other texture in code (see art/ArtLoader.ts).
 */
export class Preloader extends Scene {
  constructor() {
    super("Preloader");
  }

  preload() {
    const { width, height } = this.scale;
    const bar = this.add.rectangle(width / 2 - 100, height / 2, 4, 12, 0xe8762b).setOrigin(0, 0.5);
    this.add.rectangle(width / 2, height / 2, 204, 16).setStrokeStyle(2, 0xf1e3c2);
    this.load.on("progress", (p: number) => { bar.width = 4 + 196 * p; });

    this.load.json("manifest", "assets/manifest.json");
    // As soon as the manifest arrives, queue the image files it lists.
    this.load.once("filecomplete-json-manifest", () => queueManifestOverrides(this));
  }

  create() {
    generateMissingTextures(this);
    this.scene.start("Title");
  }
}
