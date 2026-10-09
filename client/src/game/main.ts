import { AUTO, Game, Scale } from "phaser";
import { Boot } from "./scenes/Boot";
import { Preloader } from "./scenes/Preloader";
import { Title } from "./scenes/Title";
import { World } from "./scenes/World";
import { Hud } from "./scenes/Hud";

//  Game config docs: https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig
const config: Phaser.Types.Core.GameConfig = {
  type: AUTO,
  parent: "game-container",
  backgroundColor: "#2a1a14",
  // Pixel-perfect rendering: no smoothing when scaling art up, and sprites
  // snapped to whole pixels so they never shimmer.
  pixelArt: true,
  roundPixels: true,
  // The canvas fills the window; each scene picks its own zoom.
  scale: { mode: Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  // Keep frame pacing gentle on low-end Chromebooks.
  fps: { target: 60 },
  scene: [Boot, Preloader, Title, World, Hud],
};

const StartGame = (parent: string) => new Game({ ...config, parent });

export default StartGame;
