import * as Phaser from "phaser";
import { BOOTH, PLAYER_COLORS } from "../../../../shared/constants";
import type { SnapMessage } from "../../../../shared/messages";
import type { PlayerState } from "../../../../server/src/rooms/schema/PlayerState";
import { Network } from "../net/Network";
import { BoothRtc } from "../net/BoothRtc";
import {
  HALF_W, HALF_H, DIVIDER, FRAME_W, drawVideoCover, drawCharacterStandIn, buildStrip,
} from "../art/boothArt";
import { playerTextureKey } from "../art/ArtLoader";
import { CHAR_W, CHAR_H } from "../art/characters";

interface BoothData { onClose?: () => void }

/** One side of the booth screen (left = player slot 0, right = slot 1). */
interface Panel {
  root: HTMLDivElement;
  video: HTMLVideoElement;
  standIn: HTMLCanvasElement;
  name: HTMLDivElement;
  status: HTMLDivElement;
  /** What's currently drawn, so we only redraw when it changes. */
  shown: { stream: MediaStream | null; standInKey: string };
}

/**
 * PHOTO BOOTH
 * -----------
 * Both players open this while standing in the booth. Each sees their own
 * webcam and their friend's live webcam side by side, and either one
 * presses the timer. The server counts 3-2-1 four
 * times; at each "snap" this browser grabs both video feeds into one photo
 * (left half = player 1, right half = player 2). After 4 photos you get a
 * fall-themed strip to download.
 *
 * The UI is HTML layered on the canvas (video elements are much easier in
 * HTML than in Phaser). Styles: public/style.css, "pb-" classes.
 */
export class PhotoBooth extends Phaser.Scene {
  private onClose?: () => void;
  private root?: HTMLDivElement;
  private panels: Panel[] = [];
  private rtc!: BoothRtc;
  private frames: (HTMLCanvasElement | undefined)[] = [];
  private countEl!: HTMLDivElement;
  private flashEl!: HTMLDivElement;
  private startBtn!: HTMLButtonElement;
  private resultEl!: HTMLDivElement;
  private lastPhase = "";
  private lastCount = -1;
  private unbindSnap?: () => void;
  private failedAt = 0;

  constructor() {
    super("PhotoBooth");
  }

  init(data: BoothData) {
    this.onClose = data.onClose;
    this.frames = [];
    this.panels = [];
    this.lastPhase = "";
    this.lastCount = -1;
  }

  create() {
    const room = Network.room!;
    // Register the "rtc" listener BEFORE telling the server we're in the
    // booth, so we can't miss our friend's first message.
    this.rtc = new BoothRtc(room);
    this.unbindSnap = room.onMessage("booth:snap", (msg: SnapMessage) => this.snap(msg.shot));
    this.buildDom();
    room.send("booth:enter");
    void this.rtc.startCamera();

    this.input.keyboard!.on("keydown-ESC", () => this.close());
    this.events.once("shutdown", () => this.cleanup());
  }

  private me() { return Network.room!.state.players.get(Network.room!.sessionId); }

  /** Players ordered by slot: [left, right] (either may be missing). */
  private bySlot(): (PlayerState | undefined)[] {
    const out: (PlayerState | undefined)[] = [undefined, undefined];
    for (const p of Network.room!.state.players.values()) out[p.slot] = p;
    return out;
  }

  // ------------------------------------------------------------------ DOM

  private buildDom() {
    const root = document.createElement("div");
    root.className = "pb-overlay";
    root.innerHTML = `
      <div class="pb-panel">
        <h2 class="pb-title">📸 Photo Booth</h2>
        <div class="pb-cams"></div>
        <div class="pb-actions">
          <button class="pp-btn pp-primary pb-start">Start timer (4 photos)</button>
          <button class="pp-btn pb-close">Leave booth</button>
        </div>
        <div class="pb-count"></div>
        <div class="pb-flash"></div>
        <div class="pb-result" hidden>
          <img class="pb-strip" alt="Your photo strip" />
          <div class="pb-actions">
            <a class="pp-btn pp-primary pb-download" download="pumpkin-patch-photos.png">Download strip</a>
            <button class="pp-btn pb-again">Take more</button>
          </div>
        </div>
      </div>`;
    document.getElementById("game-container")!.appendChild(root);
    this.root = root;

    const cams = root.querySelector<HTMLDivElement>(".pb-cams")!;
    for (let slot = 0; slot < 2; slot++) {
      const panel = document.createElement("div");
      panel.className = "pb-cam";
      panel.innerHTML = `
        <canvas class="pb-standin" width="${HALF_W}" height="${HALF_H}"></canvas>
        <video autoplay playsinline muted></video>
        <div class="pb-name"></div>
        <div class="pb-status"></div>`;
      cams.appendChild(panel);
      this.panels.push({
        root: panel,
        video: panel.querySelector("video")!,
        standIn: panel.querySelector(".pb-standin")!,
        name: panel.querySelector(".pb-name")!,
        status: panel.querySelector(".pb-status")!,
        shown: { stream: null, standInKey: "" },
      });
    }

    this.countEl = root.querySelector(".pb-count")!;
    this.flashEl = root.querySelector(".pb-flash")!;
    this.resultEl = root.querySelector(".pb-result")!;
    this.startBtn = root.querySelector(".pb-start")!;
    this.startBtn.onclick = () => Network.room!.send("booth:start");
    root.querySelector<HTMLButtonElement>(".pb-close")!.onclick = () => this.close();
    root.querySelector<HTMLButtonElement>(".pb-again")!.onclick = () => {
      this.resultEl.hidden = true;
      Network.room!.send("booth:start");
    };
  }

  // ------------------------------------------------------------------ every frame

  update() {
    const room = Network.room;
    if (!room || !this.root) return;
    const me = this.me();
    if (!me) return;
    const players = this.bySlot();
    const friend = players.find((p) => p && p !== me);

    // WebRTC: the slot-0 player calls once both are in the booth.
    // (We're in the booth as long as this screen is open — we don't wait for
    // the server to echo our own inBooth, or an early offer could be dropped.)
    const together = !!friend?.inBooth && friend.connected;
    if (!together && this.rtc.status !== "idle") this.rtc.disconnect();
    if (together && me.inBooth && me.slot === 0 && this.rtc.status === "idle") void this.rtc.connect();
    // If the connection failed, the caller tries again every few seconds.
    if (this.rtc.status === "failed" && me.slot === 0) {
      this.failedAt ||= performance.now();
      if (performance.now() - this.failedAt > 3000) { this.failedAt = 0; this.rtc.disconnect(); }
    }

    players.forEach((p, slot) => this.syncPanel(this.panels[slot], p, p === me, together));

    // Countdown + shutter.
    const booth = room.state.booth;
    const shooting = booth.phase === "shooting";
    this.startBtn.disabled = shooting;
    this.startBtn.textContent = shooting ? `Photo ${booth.shot} of ${BOOTH.shots}…` : "Start timer (4 photos)";
    const count = shooting ? booth.countdown : 0;
    if (count !== this.lastCount) {
      this.lastCount = count;
      this.countEl.textContent = count > 0 ? String(count) : "";
      this.countEl.classList.remove("pop");
      void this.countEl.offsetWidth; // restart the CSS animation
      if (count > 0) this.countEl.classList.add("pop");
    }
    if (booth.phase !== this.lastPhase) {
      if (booth.phase === "shooting") { this.frames = []; this.resultEl.hidden = true; }
      if (booth.phase === "done" && this.lastPhase === "shooting") this.showStrip();
      this.lastPhase = booth.phase;
    }
  }

  private syncPanel(panel: Panel, player: PlayerState | undefined, isMe: boolean, together: boolean) {
    const stream = !player ? null : isMe ? this.rtc.localStream : (together ? this.rtc.remoteStream : null);
    if (panel.shown.stream !== stream) {
      panel.video.srcObject = stream;
      panel.shown.stream = stream;
      if (stream) void panel.video.play().catch(() => {});
    }
    const hasVideo = !!stream && panel.video.videoWidth > 0;
    panel.video.style.visibility = hasVideo ? "visible" : "hidden";

    // Stand-in art (character) when there's no video.
    const key = player ? `${player.color}:${player.name}` : "empty";
    if (panel.shown.standInKey !== key) {
      panel.shown.standInKey = key;
      const ctx = panel.standIn.getContext("2d")!;
      drawCharacterStandIn(ctx, player ? this.characterCanvas(player.color) : null, player?.name ?? "", 0, 0, HALF_W, HALF_H);
    }


    panel.name.textContent = player ? (isMe ? `${player.name} (you)` : player.name) : "Waiting for a friend…";
    panel.name.style.color = player ? PLAYER_COLORS[player.color].main : "";
    let status = "";
    if (!player) status = "Invite your friend to the booth!";
    else if (isMe && this.rtc.cameraError) status = `${this.rtc.cameraError} You'll appear as your character.`;
    else if (isMe && !this.rtc.localStream) status = "Starting your camera… (allow access if asked)";
    else if (!isMe && !player.inBooth) status = `${player.name} isn't in the booth yet — walk them over!`;
    else if (!isMe && this.rtc.status === "connecting") status = "Connecting video…";
    else if (!isMe && this.rtc.status === "failed") status = "Couldn't connect video — you'll see their character.";
    else if (!isMe && !hasVideo) status = `${player.name} has no camera — showing their character.`;
    panel.status.textContent = status;
    panel.status.hidden = !status;
  }

  /** The standing-down frame of a player's character sprite, as a canvas. */
  private characterCanvas(color: number) {
    const frame = this.textures.getFrame(playerTextureKey(color), 0);
    const c = document.createElement("canvas");
    c.width = CHAR_W; c.height = CHAR_H;
    c.getContext("2d")!.drawImage(frame.source.image as CanvasImageSource, frame.cutX, frame.cutY, CHAR_W, CHAR_H, 0, 0, CHAR_W, CHAR_H);
    return c;
  }

  // ------------------------------------------------------------------ photos

  /** Grab both halves right now into photo number `shot`. */
  private snap(shot: number) {
    const frame = document.createElement("canvas");
    frame.width = FRAME_W;
    frame.height = HALF_H;
    const ctx = frame.getContext("2d")!;
    ctx.fillStyle = "#f1e3c2";
    ctx.fillRect(0, 0, FRAME_W, HALF_H);
    this.panels.forEach((panel, slot) => {
      const x = slot * (HALF_W + DIVIDER);
      const ok = panel.video.style.visibility === "visible" && drawVideoCover(ctx, panel.video, x, 0, HALF_W, HALF_H);
      if (!ok) ctx.drawImage(panel.standIn, x, 0);
    });
    this.frames[shot - 1] = frame;

    // Camera flash!
    this.flashEl.classList.remove("flash");
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add("flash");
  }

  private showStrip() {
    const players = this.bySlot().filter((p): p is PlayerState => !!p);
    // If we joined mid-shoot some photos are missing; fill with stand-ins.
    const frames = Array.from({ length: BOOTH.shots }, (_, i) => this.frames[i] ?? this.standInFrame());
    const strip = buildStrip(frames, players.map((p) => p.name), new Date());
    const url = strip.toDataURL("image/png");
    this.resultEl.querySelector<HTMLImageElement>(".pb-strip")!.src = url;
    this.resultEl.querySelector<HTMLAnchorElement>(".pb-download")!.href = url;
    this.resultEl.hidden = false;
  }

  private standInFrame() {
    const c = document.createElement("canvas");
    c.width = FRAME_W; c.height = HALF_H;
    const ctx = c.getContext("2d")!;
    this.panels.forEach((p, slot) => ctx.drawImage(p.standIn, slot * (HALF_W + DIVIDER), 0));
    return c;
  }

  // ------------------------------------------------------------------ closing

  private close() {
    this.scene.stop();
  }

  private cleanup() {
    Network.room?.send("booth:leave");
    this.unbindSnap?.();
    this.rtc.destroy();
    this.panels.forEach((p) => { p.video.srcObject = null; });
    this.root?.remove();
    this.root = undefined;
    this.input.keyboard?.removeAllListeners();
    this.onClose?.();
  }
}
