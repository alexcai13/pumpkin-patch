import * as Phaser from "phaser";
import { Dir, EMOTES } from "../../../../shared/constants";
import { DIR_FRAMES } from "../art/characters";
import { playerTextureKey } from "../art/ArtLoader";
import { FONT } from "../ui/fonts";

/** Depth for things that always draw above the world (name tags, emotes). */
export const OVERLAY_DEPTH = 1_000_000;
/** Depth for things that always draw just above the ground (shadows). */
export const SHADOW_DEPTH = 1;

/**
 * A character on the map: sprite + shadow + name tag, plus the extras that
 * activities need (a carried pumpkin, emote bubbles, sitting).
 * Used for both the local player and the remote one. It only DRAWS; who
 * decides where it goes is PlayerController (local), the interpolator
 * (remote), or the activity they're in (bench / wagon).
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

  private carryImage?: Phaser.GameObjects.Image;
  private carrying = "";
  private emote?: Phaser.GameObjects.Image;
  private sitting = false;
  /** When set, overrides Y-sorting (riders draw just above the wagon). */
  depthOverride: number | null = null;

  constructor(private scene: Phaser.Scene, x: number, y: number, private colorIndex: number, name: string, isLocal: boolean) {
    this.x = x;
    this.y = y;
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
    if (moving && !this.sitting) {
      this.sprite.anims.play(`${key}_walk_${dir}`, true);
      this.sprite.anims.timeScale = running ? 1.6 : 1;
    } else {
      this.sprite.anims.stop();
      this.sprite.setFrame(DIR_FRAMES[dir].stand);
    }
  }

  /** Sitting on a bench or the hayride: drawn a bit higher, no walking. */
  setSitting(sitting: boolean) {
    if (sitting === this.sitting) return;
    this.sitting = sitting;
    this.shadow.setVisible(!sitting);
    this.syncDisplay();
  }

  /** Hold a pumpkin over your head ("" = empty hands). */
  setCarrying(kind: string) {
    if (kind === this.carrying) return;
    const picked = !this.carrying && !!kind;
    this.carrying = kind;
    this.carryImage?.destroy();
    this.carryImage = undefined;
    if (kind) {
      this.carryImage = this.scene.add.image(this.x, this.y, kind === "big" ? "pumpkin_big" : "pumpkin").setOrigin(0.5, 1);
    }
    if (picked) this.squash();
    this.syncDisplay();
  }

  /** A quick squash-and-stretch bounce (picking things up, landing). */
  squash() {
    this.sprite.setScale(1.2, 0.8);
    this.scene.tweens.add({ targets: this.sprite, scaleX: 1, scaleY: 1, duration: 260, ease: "Back.easeOut" });
  }

  /** Pop an emote bubble above the head for a moment. */
  showEmote(kind: number) {
    const name = EMOTES[kind];
    if (!name) return;
    this.emote?.destroy();
    const bubble = this.scene.add.image(this.x, this.y, `emote_${name}`).setOrigin(0.5, 1).setDepth(OVERLAY_DEPTH + 1).setScale(0);
    this.emote = bubble;
    this.syncDisplay();
    this.scene.tweens.add({ targets: bubble, scale: 1, duration: 220, ease: "Back.easeOut" });
    this.scene.tweens.add({
      targets: bubble, alpha: 0, delay: 1500, duration: 300,
      onComplete: () => { bubble.destroy(); if (this.emote === bubble) this.emote = undefined; },
    });
  }

  setAlpha(alpha: number) {
    for (const obj of [this.sprite, this.shadow, this.nameTag, this.carryImage]) obj?.setAlpha(alpha);
  }

  /** Fade everything out, then remove it. */
  fadeOutAndDestroy(onDone?: () => void) {
    this.scene.tweens.add({
      targets: [this.sprite, this.shadow, this.nameTag, this.carryImage].filter(Boolean),
      alpha: 0,
      duration: 900,
      onComplete: () => { this.destroy(); onDone?.(); },
    });
  }

  destroy() {
    for (const obj of [this.sprite, this.shadow, this.nameTag, this.carryImage, this.emote]) obj?.destroy();
  }

  /** Where the top of the head (plus anything held) is, for stacking labels. */
  get headTop() {
    let top = Math.round(this.y) - 14 - (this.sitting ? 3 : 0);
    if (this.carryImage) top -= this.carryImage.height - 2;
    return top;
  }

  private syncDisplay() {
    // Round to whole pixels so the sprite never lands "between" pixels and blurs.
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    const lift = this.sitting ? 3 : 0;
    this.sprite.setPosition(x, y + 6 - lift);
    this.shadow.setPosition(x, y + 5);
    // Y-sorting: lower on screen = drawn in front.
    const depth = this.depthOverride ?? this.y;
    this.sprite.setDepth(depth);

    if (this.carryImage) {
      this.carryImage.setPosition(x, y - 12 - lift).setDepth(depth + 0.01);
    }
    const top = this.headTop;
    this.nameTag.setPosition(x, top - 1);
    this.emote?.setPosition(x, top - 11);
  }
}
