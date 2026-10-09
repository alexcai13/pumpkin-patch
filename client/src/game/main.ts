import { AUTO, Game, Scale } from "phaser";
import { Boot } from "./scenes/Boot";
import { Preloader } from "./scenes/Preloader";
import { Title } from "./scenes/Title";
import { World } from "./scenes/World";
import { Hud } from "./scenes/Hud";
import { RaceHud } from "./scenes/RaceHud";
import { Carving } from "./scenes/Carving";
import { CiderCozy } from "./scenes/CiderCozy";
import { CarvingViewer } from "./scenes/CarvingViewer";
import { PhotoBooth } from "./scenes/PhotoBooth";

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
  // Order matters for drawing: later scenes draw on top of earlier ones.
  scene: [Boot, Preloader, Title, World, CiderCozy, Hud, RaceHud, Carving, CarvingViewer, PhotoBooth],
};

const StartGame = (parent: string) => {
  const game = new Game({ ...config, parent });
  // Development only: poke at the game from the browser console, e.g.
  // __pumpkin.Network.room.state.players
  if (import.meta.env.DEV) {
    import("./net/Network").then(({ Network }) => { (window as any).__pumpkin = { game, Network }; });
  }
  return game;
};

export default StartGame;
