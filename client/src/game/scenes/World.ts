import { Scene } from "phaser";
import { Callbacks, CloseCode } from "@colyseus/sdk";
import { TILE, SEND_RATE_HZ, RACE, Dir } from "../../../../shared/constants";
import { PATCH_MAP } from "../../../../shared/map/patchMap";
import { CollisionGrid } from "../../../../shared/map/collision";
import type { MoveMessage, TeleportMessage } from "../../../../shared/messages";
import type { PlayerState } from "../../../../server/src/rooms/schema/PlayerState";
import { Network, type PatchRoom } from "../net/Network";
import { Interpolator } from "../net/Interpolator";
import { Character } from "../objects/Character";
import { PlayerController } from "../world/PlayerController";
import { WorldBuilder } from "../world/WorldBuilder";
import { Interactions } from "../world/Interactions";
import type { WorldContext } from "../world/WorldContext";
import { RaceView } from "../world/activities/RaceView";
import { PorchView } from "../world/activities/PorchView";
import { BenchView } from "../world/activities/BenchView";
import { HayrideView } from "../world/activities/HayrideView";
import { EmoteView } from "../world/activities/EmoteView";
import { SignView } from "../world/activities/SignView";
import { HudEvents } from "./Hud";

interface RemotePlayer {
  state: PlayerState;
  character: Character;
  interp: Interpolator;
  lastX: number;
  lastY: number;
}

/**
 * The main pumpkin patch: map, your character, your friend's character, and
 * the in-world parts of each activity (world/activities/*).
 * UI on top (room code, toasts, race timer...) lives in separate scenes.
 */
export class World extends Scene {
  private room!: PatchRoom;
  private builder!: WorldBuilder;
  private collision!: CollisionGrid;
  private interactions!: Interactions;
  private me?: Character;
  private myState?: PlayerState;
  private controller?: PlayerController;
  private remotes = new Map<string, RemotePlayer>();
  private sendTimer = 0;
  private lastSent = "";
  private zoom = 3;
  private cozyZoom = false;
  private uiOpen = false;

  private race!: RaceView;
  private bench!: BenchView;
  private hayride!: HayrideView;

  constructor() {
    super("World");
  }

  create() {
    this.room = Network.room!;
    this.remotes.clear();
    this.me = undefined;
    this.myState = undefined;
    this.controller = undefined;
    this.uiOpen = false;
    this.cozyZoom = false;

    this.builder = new WorldBuilder(this, PATCH_MAP).build();
    this.collision = new CollisionGrid(PATCH_MAP);
    this.cameras.main.setBounds(0, 0, this.builder.widthPx, this.builder.heightPx);
    this.cameras.main.setBackgroundColor("#2a1a14");
    this.interactions = new Interactions(this);

    // Everything an activity module needs, without exposing all of World.
    const ctx: WorldContext = {
      scene: this,
      room: this.room,
      collision: this.collision,
      interactions: this.interactions,
      me: () => this.myState,
      characterOf: (id) => (id === this.room.sessionId ? this.me : this.remotes.get(id)?.character),
      toast: (text) => this.game.events.emit(HudEvents.Toast, text),
      setUiOpen: (open) => { this.uiOpen = open; },
      zoom: () => this.zoom,
    };
    this.hayride = new HayrideView(ctx);
    this.race = new RaceView(ctx);
    new PorchView(ctx);
    this.bench = new BenchView(ctx, (cozy) => { this.cozyZoom = cozy; this.applyZoom(true); });
    new EmoteView(ctx);
    new SignView(ctx); // last: generic "read the sign" for signs nothing else uses

    this.scene.launch("Hud");
    this.applyZoom();
    this.scale.on("resize", this.onResize, this);
    this.events.once("shutdown", () => this.scale.off("resize", this.onResize, this));

    this.listenToRoom();
  }

  private onResize() {
    this.applyZoom();
  }

  /**
   * Pick a whole-number zoom (pixel-perfect: every art pixel becomes an exact
   * NxN block of screen pixels) that shows roughly 20x13 tiles. While cozy at
   * the cider stand, ease in 25% closer.
   */
  private applyZoom(animate = false) {
    const { width, height } = this.scale;
    this.zoom = Math.max(2, Math.floor(Math.min(width / (TILE * 20), height / (TILE * 13))));
    const target = this.cozyZoom ? this.zoom * 1.25 : this.zoom;
    if (animate) this.cameras.main.zoomTo(target, 1200, "Sine.easeInOut");
    else this.cameras.main.setZoom(target);
    const res = Math.ceil(target);
    this.builder.labels.forEach((l) => l.setResolution(res));
    this.me?.setTextResolution(res);
    this.remotes.forEach((r) => r.character.setTextResolution(res));
    this.interactions.setTextResolution(res);
    this.race?.setTextResolution(res);
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

    // The server moved us (rejected move, stood up, hopped off the wagon...).
    room.onMessage("teleport", (msg: TeleportMessage) => {
      this.controller?.teleportToTile(Math.floor(msg.x / TILE), Math.floor(msg.y / TILE));
      this.lastSent = "";
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
    this.myState = state;
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

  /**
   * Activities that place a player themselves (wagon seat, bench).
   * Returns the position to draw them at, or null if they walk normally.
   */
  private placedPosition(state: PlayerState, character: Character): { x: number; y: number } | null {
    if (state.riding >= 0) {
      character.depthOverride = this.hayride.riderDepth;
      character.setSitting(true);
      return this.hayride.seatPosition(state.riding);
    }
    character.depthOverride = null;
    if (state.seat) {
      character.setSitting(true);
      return { x: state.x, y: state.y };
    }
    character.setSitting(false);
    return null;
  }

  update(_time: number, delta: number) {
    this.hayride.update();
    this.race.update();
    this.bench.update();

    if (this.controller && this.me && this.myState) this.updateMe(delta);

    // Your friend's character: draw at the smoothed position, and work out the
    // animation from how it's actually moving on screen.
    const now = performance.now();
    for (const remote of this.remotes.values()) {
      const { state, character } = remote;
      character.setCarrying(state.carrying);
      const placed = this.placedPosition(state, character);
      if (placed) {
        character.setPosition(placed.x, placed.y);
        character.setPose(Dir.Down, false);
        remote.lastX = state.x; remote.lastY = state.y;
        continue;
      }
      const { x, y } = remote.interp.sample(now);
      const dx = x - remote.lastX, dy = y - remote.lastY;
      const moving = Math.abs(dx) + Math.abs(dy) > 0.01;
      let dir = state.dir as Dir;
      if (moving) dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? Dir.Left : Dir.Right) : (dy < 0 ? Dir.Up : Dir.Down);
      character.setPosition(x, y);
      character.setPose(dir, moving, state.running);
      remote.lastX = x; remote.lastY = y;
    }
  }

  private updateMe(delta: number) {
    const me = this.me!, ctl = this.controller!, state = this.myState!;
    me.setCarrying(state.carrying);
    // Big pumpkins are heavy.
    ctl.stepMultiplier = state.carrying === "big" ? RACE.bigSlowdown : 1;

    const placed = this.placedPosition(state, me);
    ctl.enabled = !this.uiOpen && !placed;
    this.interactions.enabled = !this.uiOpen;

    if (placed) {
      me.setPosition(placed.x, placed.y);
      me.setPose(Dir.Down, false);
      // Any arrow key gets you up off a bench.
      if (state.seat && !this.uiOpen && ctl.heldDirection() !== undefined) this.bench.stand();
    } else {
      ctl.update(delta);
      this.sendTimer += delta;
      if (this.sendTimer >= 1000 / SEND_RATE_HZ) {
        this.sendTimer = 0;
        this.sendPosition();
      }
    }

    const face = ctl.facingTile();
    this.interactions.update(
      { tileX: ctl.tileX, tileY: ctl.tileY, faceX: face.x, faceY: face.y, moving: ctl.moving, busy: !!placed },
      me,
    );
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
