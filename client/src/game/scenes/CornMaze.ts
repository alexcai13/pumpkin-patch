import * as Phaser from "phaser";
import { Callbacks } from "@colyseus/sdk";
import { TILE, SEND_RATE_HZ, PLAYER_COLORS, Dir } from "../../../../shared/constants";
import { generateMaze, type Maze } from "../../../../shared/maze";
import { CollisionGrid } from "../../../../shared/map/collision";
import type { MoveMessage } from "../../../../shared/messages";
import type { MazePlayerState } from "../../../../server/src/rooms/schema/ActivityState";
import { Network } from "../net/Network";
import { Interpolator } from "../net/Interpolator";
import { Character, OVERLAY_DEPTH } from "../objects/Character";
import { PlayerController } from "../world/PlayerController";
import { WorldBuilder } from "../world/WorldBuilder";
import { makeCanvas } from "../art/pixels";
import { FONT } from "../ui/fonts";
import { P } from "../art/palette";
import { Sound } from "../audio/Sound";

interface MazeData { onExit?: () => void }

/** Radius you can see when you're the map holder (world pixels). */
const FOG_RADIUS = 52;

/**
 * CORN MAZE (its own map)
 * The maze is generated from the seed the server picked, so both players get
 * the same one. Roles:
 *  - MAP HOLDER: sees a map of the whole maze (top-right) but only a small
 *    circle around themselves.
 *  - EXPLORER: sees everything around them normally, but has no map.
 * Talk to each other! Both reach the exit clearing (top) to finish.
 * Solo runs get the map and full vision.
 */
export class CornMaze extends Phaser.Scene {
  private onExit?: () => void;
  private maze!: Maze;
  private collision!: CollisionGrid;
  private me?: Character;
  private controller?: PlayerController;
  private friend?: { id: string; character: Character; interp: Interpolator; state: MazePlayerState; lastX: number; lastY: number };
  private fog?: Phaser.GameObjects.Image;
  private minimapDots?: Phaser.GameObjects.Graphics;
  private minimapOrigin = { x0: 0, y0: 0, cell: 1 };
  private hudCam!: Phaser.Cameras.Scene2D.Camera;
  private timerText!: Phaser.GameObjects.Text;
  private roleText!: Phaser.GameObjects.Text;
  private donePanel?: Phaser.GameObjects.Container;
  private sendTimer = 0;
  private lastSent = "";
  private localStart = 0;
  private exited = false;
  private unbinds: (() => void)[] = [];
  /** HUD objects (drawn by the HUD camera, ignored by the world camera). */
  private hudObjects: Phaser.GameObjects.GameObject[] = [];

  constructor() { super("CornMaze"); }

  init(data: MazeData) {
    this.onExit = data.onExit;
    this.exited = false;
    this.friend = undefined;
    this.me = undefined;
    this.donePanel = undefined;
    this.hudObjects = [];
    this.lastSent = "";
  }

  private get m() { return Network.room!.state.maze; }
  private get myId() { return Network.room!.sessionId; }

  create() {
    const room = Network.room!;
    this.maze = generateMaze(this.m.seed);
    this.collision = new CollisionGrid(this.maze.map);
    const builder = new WorldBuilder(this, this.maze.map).build();
    this.localStart = performance.now() - Math.max(0, Date.now() - this.m.startedAt);

    // Exit clearing: lanterns + a glowing "EXIT" sign.
    const ex = this.maze.exit;
    for (const x of [ex.x, ex.x + ex.w - 1]) this.add.image(x * TILE + 8, (ex.y + 2) * TILE, "lantern_lit").setOrigin(0.5, 1).setDepth((ex.y + 1) * TILE);
    this.add.text((ex.x + ex.w / 2) * TILE, ex.y * TILE + 4, "EXIT", { fontFamily: FONT, fontSize: "8px", color: "#ffe08a", stroke: "#2a1a14", strokeThickness: 3 })
      .setOrigin(0.5, 0).setDepth(OVERLAY_DEPTH).setResolution(4);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, builder.widthPx, builder.heightPx);
    cam.setBackgroundColor("#2a1a14");
    const zoom = Math.max(2, Math.floor(Math.min(this.scale.width / (TILE * 20), this.scale.height / (TILE * 13))));
    cam.setZoom(zoom);

    // Me
    const mine = this.m.players.get(this.myId);
    const myState = room.state.players.get(this.myId)!;
    this.me = new Character(this, mine?.x ?? 0, mine?.y ?? 0, myState.color, myState.name, true);
    this.me.setHat(myState.hat);
    this.me.setTextResolution(zoom);
    this.controller = new PlayerController(this, this.me, this.collision);
    this.controller.teleportToTile(Math.floor((mine?.x ?? 0) / TILE), Math.floor((mine?.y ?? 0) / TILE));
    this.me.dir = Dir.Up;
    cam.startFollow(this.me.sprite, true);

    // My friend
    for (const [id, mp] of this.m.players) {
      if (id === this.myId) continue;
      const ps = room.state.players.get(id);
      const character = new Character(this, mp.x, mp.y, ps?.color ?? 0, ps?.name ?? "Friend", false);
      character.setHat(ps?.hat ?? "");
      character.setTextResolution(zoom);
      const interp = new Interpolator(mp.x, mp.y);
      this.friend = { id, character, interp, state: mp, lastX: mp.x, lastY: mp.y };
      let px = mp.x, py = mp.y;
      this.unbinds.push(Callbacks.get(room).onChange(mp, () => {
        if (mp.x !== px || mp.y !== py) { interp.push(mp.x, mp.y); px = mp.x; py = mp.y; }
      }));
    }

    // Roles
    const solo = this.m.players.size <= 1;
    const iHaveMap = solo || this.m.mapHolder === this.myId;
    const iHaveFog = !solo && this.m.mapHolder === this.myId;
    if (iHaveFog) this.makeFog();

    // HUD: a second camera at zoom 1 that only draws HUD things, so text and
    // the minimap stay crisp and fixed on screen.
    this.hudCam = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    this.timerText = this.hud(this.add.text(this.scale.width / 2, 12, "", hudStyle(22, P.goldLight)).setOrigin(0.5, 0));
    const roleLine = solo ? "Solo run: find the EXIT at the top!" :
      iHaveMap ? "🗺 You have the MAP, but it's dark… guide your friend!" : "👀 You can see, but have no map. Ask your friend which way!";
    // Role line at the bottom (the top is busy with the timer, HUD and minimap).
    this.roleText = this.hud(this.add.text(this.scale.width / 2, this.scale.height - 56, roleLine, hudStyle(15)).setOrigin(0.5, 0));
    this.hud(this.add.text(this.scale.width - 12, this.scale.height - 26, "Esc: give up", hudStyle(12)).setOrigin(1, 0).setAlpha(0.8));
    if (iHaveMap) this.makeMinimap();
    // The world camera ignores HUD things; the HUD camera ignores everything else.
    cam.ignore(this.hudObjects);
    this.hudCam.ignore(this.children.list.filter((o) => !this.hudObjects.includes(o)));

    this.unbinds.push(room.onMessage("maze:teleport", (msg: { x: number; y: number }) => {
      this.controller?.teleportToTile(Math.floor(msg.x / TILE), Math.floor(msg.y / TILE));
      this.lastSent = "";
    }));
    this.input.keyboard!.on("keydown-ESC", () => room.send("maze:leave"));
    this.events.once("shutdown", () => {
      this.unbinds.forEach((u) => u());
      this.unbinds = [];
      this.input.keyboard?.removeAllListeners();
    });
  }

  /** Register a HUD object (drawn only by the HUD camera). */
  private hud<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.hudObjects.push(obj);
    this.cameras.main?.ignore(obj);
    return obj;
  }

  /** Darkness everywhere except a circle around you (chunky pixel edge). */
  private makeFog() {
    const size = 140, scale = 8, r = FOG_RADIUS / scale;
    const { canvas, ctx } = makeCanvas(size, size);
    ctx.fillStyle = "rgba(10, 6, 4, 1)";
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2);
        if (d < r) ctx.clearRect(x, y, 1, 1);
        else if (d < r + 1.5) { ctx.clearRect(x, y, 1, 1); ctx.fillStyle = "rgba(10, 6, 4, 0.6)"; ctx.fillRect(x, y, 1, 1); }
      }
    }
    if (this.textures.exists("maze_fog")) this.textures.remove("maze_fog");
    this.textures.addCanvas("maze_fog", canvas);
    this.fog = this.add.image(0, 0, "maze_fog").setScale(scale).setDepth(OVERLAY_DEPTH + 5);
  }

  /** The whole maze, small, in the top-right corner. */
  private makeMinimap() {
    const cell = Math.max(3, Math.min(5, Math.floor(180 / this.maze.width)));
    const w = this.maze.width * cell, h = this.maze.height * cell;
    const x0 = this.scale.width - w - 14, y0 = 14;
    const g = this.hud(this.add.graphics());
    g.fillStyle(0x2a1a14, 0.9).fillRect(x0 - 4, y0 - 4, w + 8, h + 8);
    this.maze.map.rows.forEach((row, ty) => {
      for (let tx = 0; tx < row.length; tx++) {
        g.fillStyle(row[tx] === "C" ? 0x9a7d33 : 0xcc9d66).fillRect(x0 + tx * cell, y0 + ty * cell, cell, cell);
      }
    });
    const ex = this.maze.exit;
    g.fillStyle(0x8be04e).fillRect(x0 + ex.x * cell, y0 + ex.y * cell, ex.w * cell, ex.h * cell);
    this.minimapDots = this.hud(this.add.graphics());
    this.minimapOrigin = { x0, y0, cell };
  }

  update(_time: number, delta: number) {
    if (this.exited) return;
    const room = Network.room!;
    const m = this.m;
    // Run over (or we were removed): back to the patch.
    if (m.phase === "idle" || !m.players.has(this.myId)) return this.exit();

    if (this.me && this.controller) {
      this.controller.enabled = m.phase === "running";
      this.controller.update(delta);
      this.sendTimer += delta;
      if (this.sendTimer >= 1000 / SEND_RATE_HZ) {
        this.sendTimer = 0;
        const msg: MoveMessage = { x: Math.round(this.me.x), y: Math.round(this.me.y), dir: this.me.dir, moving: this.controller.moving, running: false };
        const key = `${msg.x},${msg.y},${msg.dir},${msg.moving}`;
        if (key !== this.lastSent) { this.lastSent = key; room.send("maze:move", msg); }
      }
      this.fog?.setPosition(Math.round(this.me.x), Math.round(this.me.y));
    }

    if (this.friend) {
      const f = this.friend;
      const { x, y } = f.interp.sample();
      const dx = x - f.lastX, dy = y - f.lastY;
      const moving = Math.abs(dx) + Math.abs(dy) > 0.01;
      const dir = moving ? (Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? Dir.Left : Dir.Right) : (dy < 0 ? Dir.Up : Dir.Down)) : (f.state.dir as Dir);
      f.character.setPosition(x, y);
      f.character.setPose(dir, moving);
      f.lastX = x; f.lastY = y;
    }

    // Minimap dots
    if (this.minimapDots && this.me) {
      const { x0, y0, cell } = this.minimapOrigin;
      const g = this.minimapDots.clear();
      const dot = (px: number, py: number, color: number) => g.fillStyle(color).fillRect(x0 + (px / TILE) * cell - cell / 2, y0 + (py / TILE) * cell - cell / 2, cell + 1, cell + 1);
      if (this.friend) dot(this.friend.character.x, this.friend.character.y, hexColor(PLAYER_COLORS[room.state.players.get(this.friend.id)?.color ?? 0].main));
      dot(this.me.x, this.me.y, 0xffffff);
    }

    // Timer
    const ms = m.phase === "done" ? m.finishMs : performance.now() - this.localStart;
    this.timerText.setText(`⏱ ${formatTime(ms)}${m.bestMs ? `   ·   best ${formatTime(m.bestMs)}` : ""}`);
    if (m.phase === "done" && !this.donePanel) this.showDone();
  }

  private showDone() {
    Sound.play("win");
    const m = this.m;
    const best = m.bestMs === m.finishMs ? "New best time! 🎉" : `Best: ${formatTime(m.bestMs)}`;
    const w = this.scale.width, h = this.scale.height;
    const bg = this.add.rectangle(0, 0, 380, 170, 0x2a1a14, 0.94).setStrokeStyle(4, 0x8be04e);
    const t1 = this.add.text(0, -45, "You made it out together!", hudStyle(22, P.goldLight)).setOrigin(0.5);
    const t2 = this.add.text(0, 0, `Time: ${formatTime(m.finishMs)}\n${best}`, hudStyle(18)).setOrigin(0.5).setAlign("center");
    const t3 = this.add.text(0, 52, "🎟 +tickets  ·  heading back to the patch…", hudStyle(13)).setOrigin(0.5);
    this.donePanel = this.hud(this.add.container(w / 2, h / 2, [bg, t1, t2, t3]));
    [bg, t1, t2, t3].forEach((o) => this.cameras.main.ignore(o));
    this.donePanel.setScale(0.7);
    this.tweens.add({ targets: this.donePanel, scale: 1, duration: 300, ease: "Back.easeOut" });
    this.roleText.setText("");
  }

  private exit() {
    if (this.exited) return;
    this.exited = true;
    this.onExit?.();
    this.scene.stop();
  }
}

function hudStyle(size: number, color: string = P.cream) {
  return { fontFamily: FONT, fontSize: `${size}px`, color, stroke: "#2a1a14", strokeThickness: 4 };
}
function hexColor(hex: string) { return Number.parseInt(hex.slice(1), 16); }
function formatTime(ms: number) {
  const s = Math.max(0, ms) / 1000;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
}
