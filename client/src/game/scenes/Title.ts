import { Scene } from "phaser";
import { PLAYER_COLORS, NAME_MAX } from "../../../../shared/constants";
import { PATCH_MAP } from "../../../../shared/map/patchMap";
import { WorldBuilder } from "../world/WorldBuilder";
import { Leaves } from "../ui/Leaves";
import { Network, describeJoinError, normalizeCode } from "../net/Network";
import { playerTextureKey } from "../art/ArtLoader";
import { CHAR_W, CHAR_H } from "../art/characters";

const STORAGE_KEY = "pumpkin-patch-profile";

/**
 * Title screen: name, color, Create Room / Join Room.
 *
 * The form is plain HTML layered over the canvas (Phaser has no text inputs),
 * styled in public/style.css. Behind it, the real patch map slowly pans by.
 */
export class Title extends Scene {
  private panel?: HTMLDivElement;
  private leaves?: Leaves;
  private panDir = 1;

  constructor() {
    super("Title");
  }

  create() {
    // Background: the actual map, zoomed in, drifting slowly sideways.
    const world = new WorldBuilder(this, PATCH_MAP).build();
    const cam = this.cameras.main;
    cam.setBounds(0, 0, world.widthPx, world.heightPx);
    cam.setZoom(3);
    cam.centerOn(30 * 16, 22 * 16);
    world.labels.forEach((l) => l.setResolution(3));
    this.leaves = new Leaves(this, 28, 3);

    this.buildPanel();
    // Remove the HTML when this scene ends.
    this.events.once("shutdown", () => this.panel?.remove());
  }

  update(_time: number, delta: number) {
    this.leaves?.update(delta);
    const cam = this.cameras.main;
    cam.scrollX += this.panDir * delta * 0.006;
    // Bounce between two points so it never hits a wall.
    if (cam.scrollX > 700) this.panDir = -1;
    if (cam.scrollX < 200) this.panDir = 1;
  }

  private buildPanel() {
    const saved = loadProfile();
    let color = saved.color;

    const panel = document.createElement("div");
    panel.className = "pp-panel";
    panel.innerHTML = `
      <h1 class="pp-title">Pumpkin Patch <span>Pals</span></h1>
      <p class="pp-sub">A cozy autumn patch for two friends</p>
      <label class="pp-label">Your name
        <input class="pp-input" id="pp-name" maxlength="${NAME_MAX}" autocomplete="off" spellcheck="false" />
      </label>
      <div class="pp-label">Your color</div>
      <div class="pp-colors" id="pp-colors"></div>
      <button class="pp-btn pp-primary" id="pp-create">Create Room</button>
      <div class="pp-or">or join a friend</div>
      <div class="pp-join">
        <input class="pp-input pp-code" id="pp-code" maxlength="8" placeholder="PUMP42" autocomplete="off" spellcheck="false" />
        <button class="pp-btn" id="pp-join">Join Room</button>
      </div>
      <p class="pp-error" id="pp-error" role="alert"></p>
    `;
    document.getElementById("game-container")!.appendChild(panel);
    this.panel = panel;

    const $ = <T extends HTMLElement>(id: string) => panel.querySelector<T>(`#${id}`)!;
    const nameInput = $<HTMLInputElement>("pp-name");
    const codeInput = $<HTMLInputElement>("pp-code");
    const errorEl = $("pp-error");
    const createBtn = $<HTMLButtonElement>("pp-create");
    const joinBtn = $<HTMLButtonElement>("pp-join");
    nameInput.value = saved.name;

    // Color swatches, each showing a preview of the character in that color.
    const colorsEl = $("pp-colors");
    PLAYER_COLORS.forEach((c, i) => {
      const btn = document.createElement("button");
      btn.className = "pp-swatch";
      btn.title = c.name;
      btn.setAttribute("aria-label", c.name);
      btn.style.setProperty("--swatch", c.main);
      btn.appendChild(this.characterPreview(i));
      btn.onclick = () => { color = i; refreshSwatches(); };
      colorsEl.appendChild(btn);
    });
    const refreshSwatches = () => {
      [...colorsEl.children].forEach((el, i) => el.classList.toggle("selected", i === color));
    };
    refreshSwatches();

    codeInput.addEventListener("input", () => { codeInput.value = normalizeCode(codeInput.value); });
    codeInput.addEventListener("keydown", (e) => { if (e.key === "Enter") joinBtn.click(); });
    nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") createBtn.click(); });

    const setBusy = (busy: boolean, text = "") => {
      createBtn.disabled = joinBtn.disabled = busy;
      errorEl.textContent = text;
      errorEl.classList.toggle("pp-info", busy);
    };

    const go = async (mode: "create" | "join") => {
      const name = nameInput.value.trim() || "Friend";
      const code = codeInput.value;
      if (mode === "join" && code.length < 4) {
        setBusy(false, "Type the room code your friend sees on their screen.");
        codeInput.focus();
        return;
      }
      saveProfile({ name, color });
      setBusy(true, mode === "create" ? "Planting your patch…" : "Walking over to your friend's patch…");
      // The free server host sleeps when nobody's playing; waking it takes a while.
      const slow = window.setTimeout(() => {
        setBusy(true, "Waking up the farm server… the first visit in a while can take up to a minute 🌙");
      }, 6000);
      try {
        if (mode === "create") await Network.createRoom({ name, color });
        else await Network.joinRoom(code, { name, color });
        this.scene.start("World");
      } catch (err) {
        console.error(err);
        setBusy(false, describeJoinError(err));
      } finally {
        window.clearTimeout(slow);
      }
    };
    createBtn.onclick = () => go("create");
    joinBtn.onclick = () => go("join");

    if (!saved.name) nameInput.focus();
  }

  /** Copies the standing-down frame of a character texture into a small canvas. */
  private characterPreview(colorIndex: number) {
    const canvas = document.createElement("canvas");
    canvas.width = CHAR_W;
    canvas.height = CHAR_H;
    const ctx = canvas.getContext("2d")!;
    const frame = this.textures.getFrame(playerTextureKey(colorIndex), 0);
    ctx.drawImage(
      frame.source.image as CanvasImageSource,
      frame.cutX, frame.cutY, CHAR_W, CHAR_H, 0, 0, CHAR_W, CHAR_H,
    );
    return canvas;
  }
}

// Remember name + color between visits. Wrapped in try/catch because storage
// can be blocked (private windows, school device policies).
function loadProfile(): { name: string; color: number } {
  try {
    const p = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return { name: String(p.name ?? ""), color: Math.min(PLAYER_COLORS.length - 1, Math.max(0, Number(p.color) || 0)) };
  } catch {
    return { name: "", color: 0 };
  }
}
function saveProfile(p: { name: string; color: number }) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}
