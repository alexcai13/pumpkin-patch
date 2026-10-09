import * as Phaser from "phaser";
import { FONT } from "../ui/fonts";
import { OVERLAY_DEPTH, type Character } from "../objects/Character";

/** Something you can do right now: the prompt text, and what E does. */
export interface Interaction {
  label: string;
  use: () => void;
}

/** Where the player is: their tile and the tile they're facing. */
export interface InteractContext {
  tileX: number;
  tileY: number;
  faceX: number;
  faceY: number;
  /** True while the player is mid-step between tiles. */
  moving: boolean;
  /**
   * True while sitting or riding: only the "priority" providers (added with
   * addFirst, e.g. Stand up / Hop off) are asked.
   */
  busy: boolean;
}

/**
 * Each activity registers a "provider": a function that looks at where the
 * player is and returns an Interaction if one is available (or null).
 * Providers are asked in order; the first one that answers wins. Put
 * "special state" providers (sitting, riding) first so they take priority.
 */
export type InteractionProvider = (ctx: InteractContext) => Interaction | null;

/**
 * INTERACTION SYSTEM
 * Every frame, find the best available interaction and show a small
 * "[E] Do the thing" prompt above your head. Pressing E or Space runs it.
 */
export class Interactions {
  private providers: InteractionProvider[] = [];
  private priority: InteractionProvider[] = [];
  private current: Interaction | null = null;
  private prompt: Phaser.GameObjects.Text;
  /** Set false while a menu/minigame is open. */
  enabled = true;

  constructor(private scene: Phaser.Scene) {
    this.prompt = scene.add.text(0, 0, "", {
      fontFamily: FONT,
      fontSize: "7px",
      color: "#2a1a14",
      backgroundColor: "#f1e3c2",
      padding: { x: 3, y: 1 },
    }).setOrigin(0.5, 1).setDepth(OVERLAY_DEPTH + 2).setVisible(false);

    const kb = scene.input.keyboard!;
    for (const code of [Phaser.Input.Keyboard.KeyCodes.E, Phaser.Input.Keyboard.KeyCodes.SPACE]) {
      kb.addKey(code).on("down", () => this.trigger());
    }
  }

  add(provider: InteractionProvider) {
    this.providers.push(provider);
  }

  /** A provider asked before all others, even while busy (sitting/riding). */
  addFirst(provider: InteractionProvider) {
    this.priority.push(provider);
  }

  setTextResolution(zoom: number) {
    this.prompt.setResolution(zoom);
  }

  update(ctx: InteractContext | null, me: Character | undefined) {
    this.current = null;
    if (this.enabled && ctx && me) {
      const list = ctx.busy ? this.priority : [...this.priority, ...this.providers];
      for (const provider of list) {
        const found = provider(ctx);
        if (found) { this.current = found; break; }
      }
    }
    if (this.current && me) {
      this.prompt.setText(`E  ${this.current.label}`);
      this.prompt.setPosition(Math.round(me.x), me.headTop - 12);
      this.prompt.setVisible(true);
    } else {
      this.prompt.setVisible(false);
    }
  }

  private trigger() {
    if (!this.enabled || !this.current) return;
    const action = this.current;
    action.use();
    // Little "press" feedback on the prompt.
    this.prompt.setScale(0.85);
    this.scene.tweens.add({ targets: this.prompt, scale: 1, duration: 120 });
  }
}

/** True if (x, y) is inside a rectangle of tiles. */
export function inRect(x: number, y: number, r: { x: number; y: number; w: number; h: number }) {
  return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
}
