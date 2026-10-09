import { Scene } from "phaser";
import { Callbacks, CloseCode } from "@colyseus/sdk";
import { TILE, SEND_RATE_HZ, Dir } from "../../../../shared/constants";
import { PATCH_MAP } from "../../../../shared/map/patchMap";
import { CollisionGrid } from "../../../../shared/map/collision";
import type { MoveMessage, CorrectMessage } from "../../../../shared/messages";
import type { PlayerState } from "../../../../server/src/rooms/schema/PlayerState";
import { Network, type PatchRoom } from "../net/Network";
import { Interpolator } from "../net/Interpolator";
import { Character } from "../objects/Character";
import { PlayerController } from "../world/PlayerController";
import { WorldBuilder } from "../world/WorldBuilder";
import { HudEvents } from "./Hud";

interface RemotePlayer {
  state: PlayerState;
  character: Character;
  interp: Interpolator;
  lastX: number;
  lastY: number;
}

/**
 * The main pumpkin patch: map, your character, your friend's character.
 * UI text (room code, messages) lives in the Hud scene running on top.
 */
export class World extends Scene {
  private room!: PatchRoom;
  private builder!: WorldBuilder;
  private collision!: CollisionGrid;
  private me?: Character;
  private controller?: PlayerController;
  private remotes = new Map<string, RemotePlayer>();
  private sendTimer = 0;
  private lastSent = "";
  private zoom = 3;

  constructor() {
    super("World");
  }

  create() {
    this.room = Network.room!;
    this.remotes.clear();
    this.me = undefined;
    this.controller = undefined;

    this.builder = new WorldBuilder(this, PATCH_MAP).build();
    this.collision = new CollisionGrid(PATCH_MAP);
    this.cameras.main.setBounds(0, 0, this.builder.widthPx, this.builder.heightPx);
    this.cameras.main.setBackgroundColor("#2a1a14");

    this.scene.launch("Hud");
    this.applyZoom();
    this.scale.on("resize", this.applyZoom, this);
    this.events.once("shutdown", () => this.scale.off("resize", this.applyZoom, this));

    this.listenToRoom();
  }

  /**
   * Pick a whole-number zoom (pixel-perfect: every art pixel becomes an exact
   * NxN block of screen pixels) that shows roughly 20x13 tiles.
   */
  private applyZoom() {
    const { width, height } = this.scale;
    this.zoom = Math.max(2, Math.floor(Math.min(width / (TILE * 20), height / (TILE * 13))));
    this.cameras.main.setZoom(this.zoom);
    this.builder.labels.forEach((l) => l.setResolution(this.zoom));
    this.me?.setTextResolution(this.zoom);
    this.remotes.forEach((r) => r.character.setTextResolution(this.zoom));
  }

  private listenToRoom() {
    const room = this.room;
    const callbacks = Callbacks.get(room);

    // Fires for players already in the room AND anyone who joins later.
    callbacks.onAdd("players", (player: PlayerState, sessionId: string) => {
      if (sessionId === room.sessionId) this.spawnMe(player);
      else this.spawnRemote(sessionId, player);
    });

    callbacks.onRemove("players", (player: PlayerState, sessionId: string) => {
      const remote = this.remotes.get(sessionId);
      if (!remote) return;
      this.remotes.delete(sessionId);
      remote.character.fadeOutAndDestroy();
      this.game.events.emit(HudEvents.Toast, `${player.name} left the patch`);
    });

    // The server rejected a position (too fast / inside a wall): snap back.
    room.onMessage("correct", (msg: CorrectMessage) => {
      this.controller?.teleportToTile(Math.floor(msg.x / TILE), Math.floor(msg.y / TILE));
    });

    room.onDrop(() => this.game.events.emit(HudEvents.Connection, "reconnecting"));
    room.onReconnect(() => this.game.events.emit(HudEvents.Connection, "ok"));
    room.onLeave((code: number) => {
      // CONSENTED = we left on purpose; anything else means the connection is gone.
      if (code !== CloseCode.CONSENTED && code !== CloseCode.NORMAL_CLOSURE) {
        this.game.events.emit(HudEvents.Connection, "lost");
      }
    });
  }

  private spawnMe(state: PlayerState) {
    if (this.me) return;
    this.me = new Character(this, state.x, state.y, state.color, state.name, true);
    this.me.setTextResolution(this.zoom);
    this.controller = new PlayerController(this, this.me, this.collision);
    this.cameras.main.startFollow(this.me.sprite, true);
  }

  private spawnRemote(sessionId: string, state: PlayerState) {
    const character = new Character(this, state.x, state.y, state.color, state.name, false);
    character.setTextResolution(this.zoom);
    character.setPose(state.dir as Dir, false);
    const remote: RemotePlayer = { state, character, interp: new Interpolator(state.x, state.y), lastX: state.x, lastY: state.y };
    this.remotes.set(sessionId, remote);

    const callbacks = Callbacks.get(this.room);
    // Every time their synced fields change, record a position snapshot.
    let prevX = state.x, prevY = state.y;
    callbacks.onChange(state, () => {
      if (state.x !== prevX || state.y !== prevY) {
        remote.interp.push(state.x, state.y);
        prevX = state.x; prevY = state.y;
      }
    });
    callbacks.listen(state, "connected", (connected: boolean, previous: boolean) => {
      character.setAlpha(connected ? 1 : 0.4);
      if (!connected) this.game.events.emit(HudEvents.Toast, `${state.name} lost connection… waiting for them`);
      else if (previous === false) this.game.events.emit(HudEvents.Toast, `${state.name} is back!`);
    });

    this.game.events.emit(HudEvents.Toast, `${state.name} is in the patch!`);
  }

  update(_time: number, delta: number) {
    // Your character
    if (this.controller && this.me) {
      this.controller.update(delta);
      this.sendTimer += delta;
      if (this.sendTimer >= 1000 / SEND_RATE_HZ) {
        this.sendTimer = 0;
        this.sendPosition();
      }
    }

    // Your friend's character: draw at the smoothed position, and work out the
    // animation from how it's actually moving on screen.
    const now = performance.now();
    for (const remote of this.remotes.values()) {
      const { x, y } = remote.interp.sample(now);
      const dx = x - remote.lastX, dy = y - remote.lastY;
      const moving = Math.abs(dx) + Math.abs(dy) > 0.01;
      let dir = remote.state.dir as Dir;
      if (moving) dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? Dir.Left : Dir.Right) : (dy < 0 ? Dir.Up : Dir.Down);
      remote.character.setPosition(x, y);
      remote.character.setPose(dir, moving, remote.state.running);
      remote.lastX = x; remote.lastY = y;
    }
  }

  /** Sends our position, but only if something changed since last time. */
  private sendPosition() {
    const me = this.me!, ctl = this.controller!;
    const msg: MoveMessage = {
      x: Math.round(me.x * 10) / 10,
      y: Math.round(me.y * 10) / 10,
      dir: me.dir,
      moving: ctl.moving,
      running: ctl.running && ctl.moving,
    };
    const key = `${msg.x},${msg.y},${msg.dir},${msg.moving},${msg.running}`;
    if (key === this.lastSent) return;
    this.lastSent = key;
    this.room.send("move", msg);
  }
}
