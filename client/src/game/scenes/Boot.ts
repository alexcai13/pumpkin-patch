import { Scene } from "phaser";
import { loadFonts } from "../ui/fonts";

/** First scene: waits for the pixel font, then hands off to the Preloader. */
export class Boot extends Scene {
  constructor() {
    super("Boot");
  }

  create() {
    loadFonts().then(() => this.scene.start("Preloader"));
  }
}
