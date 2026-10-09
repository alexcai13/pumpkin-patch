import * as Phaser from "phaser";
import { Dir } from "../../../../shared/constants";
import { DIR_FRAMES } from "../art/characters";
import { playerTextureKey } from "../art/ArtLoader";
import { FONT } from "../ui/fonts";

/** Depth for things that always draw above the world (name tags, emotes). */
export const OVERLAY_DEPTH = 1_000_000;
/** Depth for things that always draw just above the ground (shadows). */
export const SHADOW_DEPTH = 1;

/**
 * A character on the map: sprite + shadow + name tag.
 * Used for both the local player and the remote one. It only DRAWS; who
 * decides where it goes is PlayerController (local) or the interpolator (remote).
 *
 * (x, y) is the character's feet — the middle of the tile they stand on.
 */
export class Character {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly shadow: Phaser.GameObjects.Image;
  readonly nameTag: Phaser.GameObjects.Text;
  x: number;
  y: number;
  dir: Dir = Dir.Down;
  private colorIndex: number;

  constructor(private scene: Phaser.Scene, x: number, y: number, colorIndex: number, name: string, isLocal: boolean) {
    this.x = x;
    this.y = y;
    this.colorIndex = colorIndex;
    Character.ensureAnimations(scene, colorIndex);

    this.shadow = scene.add.image(x, y, "shadow").setDepth(SHADOW_DEPTH);
    // Origin at the bottom-center of the 16x20 frame, nudged so feet sit on the tile.
    this.sprite = scene.add.sprite(x, y, playerTextureKey(colorIndex), 0).setOrigin(0.5, 1);
    this.nameTag = scene.add.text(x, y, name, {
      fontFamily: FONT,
      fontSize: "8px",
      color: isLocal ? "#fff4d6" : "#ffe08a",
      stroke: "#2a1a14",
      strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(OVERLAY_DEPTH);
    this.syncDisplay();
  }

  /** Creates the walk animations for one color the first time it's needed. */
  static ensureAnimations(scene: Phaser.Scene, colorIndex: number) {
    const key = playerTextureKey(colorIndex);
    DIR_FRAMES.forEach((frames, dir) => {
      const animKey = `${key}_walk_${dir}`;
      if (scene.anims.exists(animKey)) return;
      scene.anims.create({
        key: animKey,
        frames: frames.walk.map((frame) => ({ key, frame })),
        frameRate: 8,
        repeat: -1,
      });
    });
  }

  /** Text is rendered at the camera zoom so it stays sharp when scaled up. */
  setTextResolution(zoom: number) {
    this.nameTag.setResolution(zoom);
  }

  setPosition(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.syncDisplay();
  }

  /** Show walking (with speed) or standing, facing `dir`. */
  setPose(dir: Dir, moving: boolean, running = false) {
    this.dir = dir;
    const key = playerTextureKey(this.colorIndex);
    if (moving) {
      this.sprite.anims.play(`${key}_walk_${dir}`, true);
      this.sprite.anims.timeScale = running ? 1.6 : 1;
    } else {
      this.sprite.anims.stop();
      this.sprite.setFrame(DIR_FRAMES[dir].stand);
    }
  }

  setAlpha(alpha: number) {
    for (const obj of [this.sprite, this.shadow, this.nameTag]) obj.setAlpha(alpha);
  }

  /** Fade everything out, then remove it. */
  fadeOutAndDestroy(onDone?: () => void) {
    this.scene.tweens.add({
      targets: [this.sprite, this.shadow, this.nameTag],
      alpha: 0,
      duration: 900,
      onComplete: () => { this.destroy(); onDone?.(); },
    });
  }

  destroy() {
    this.sprite.destroy();
    this.shadow.destroy();
    this.nameTag.destroy();
  }

  private syncDisplay() {
    // Round to whole pixels so the sprite never lands "between" pixels and blurs.
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    this.sprite.setPosition(x, y + 6);
    this.shadow.setPosition(x, y + 5);
    this.nameTag.setPosition(x, y - 15);
    // Y-sorting: lower on screen = drawn in front.
    this.sprite.setDepth(this.y);
  }
}
