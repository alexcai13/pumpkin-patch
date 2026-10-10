import * as Phaser from "phaser";
import { NOTE_MAX, PLAYER_COLORS } from "../../../../shared/constants";
import type { NoteEntry } from "../../../../server/src/rooms/schema/ActivityState";
import { Network } from "../net/Network";
import { Sound } from "../audio/Sound";

interface NoteData { onClose?: () => void }

/**
 * NOTE BOARD
 * Write your friend a note and pin it up. Nobody can read anything until
 * you've BOTH pinned one; then both notes appear side by side for both of
 * you. Older rounds stay below so you can scroll back.
 *
 * The UI is HTML (a real text box is much nicer than a Phaser one). Styles:
 * public/style.css, "nb-" classes. Rules: server/src/rooms/activities/Notes.ts
 */
export class NoteBoard extends Phaser.Scene {
  private onClose?: () => void;
  private root?: HTMLDivElement;
  private writeBox!: HTMLDivElement;
  private waitingBox!: HTMLDivElement;
  private statusEl!: HTMLParagraphElement;
  private textarea!: HTMLTextAreaElement;
  private historyEl!: HTMLDivElement;
  private shownNotes = -1;
  private editing = false;
  private lastRound = 0;

  constructor() { super("NoteBoard"); }

  init(data: NoteData) {
    this.onClose = data.onClose;
    this.shownNotes = -1;
    this.editing = false;
  }

  private get room() { return Network.room!; }
  private get notes() { return this.room.state.notes; }
  private friend() {
    for (const [id, p] of this.room.state.players) if (id !== this.room.sessionId) return { id, p };
    return undefined;
  }

  create() {
    const root = document.createElement("div");
    root.className = "nb-overlay";
    root.innerHTML = `
      <div class="nb-panel">
        <h2 class="nb-title">💌 Note Board</h2>
        <p class="nb-status"></p>
        <div class="nb-history"></div>
        <div class="nb-round nb-write-label">Write a new note</div>
        <div class="nb-write">
          <textarea class="pp-input nb-text" maxlength="${NOTE_MAX}" rows="4" placeholder="Write something nice…"></textarea>
          <div class="nb-row">
            <span class="nb-count"></span>
            <button class="pp-btn pp-primary nb-submit">📌 Pin it up</button>
          </div>
        </div>
        <div class="nb-waiting" hidden>
          <p>📌 Your note is pinned! It stays secret until your friend pins theirs.</p>
          <button class="pp-btn nb-edit">Change my note</button>
        </div>
        <div class="nb-row nb-bottom"><button class="pp-btn nb-close">Close (Esc)</button></div>
      </div>`;
    document.getElementById("game-container")!.appendChild(root);
    this.root = root;

    const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
    this.textarea = $(".nb-text");
    this.writeBox = $(".nb-write");
    this.waitingBox = $(".nb-waiting");
    this.statusEl = $(".nb-status");
    this.historyEl = $(".nb-history");
    const count = $(".nb-count");
    const updateCount = () => { count.textContent = `${this.textarea.value.length} / ${NOTE_MAX}`; };
    updateCount();
    this.textarea.addEventListener("input", updateCount);

    // Typing in the box must not walk your character, emote, mute, etc.:
    // stop key events here before the game (listening on window) sees them.
    for (const type of ["keydown", "keyup", "keypress"]) {
      this.textarea.addEventListener(type, (e) => {
        e.stopPropagation();
        const ke = e as KeyboardEvent;
        if (type === "keydown" && ke.key === "Escape") this.close();
        // Ctrl/Cmd + Enter pins the note.
        if (type === "keydown" && ke.key === "Enter" && (ke.ctrlKey || ke.metaKey)) this.submit();
      });
    }
    $<HTMLButtonElement>(".nb-submit").onclick = () => this.submit();
    $<HTMLButtonElement>(".nb-edit").onclick = () => { this.editing = true; this.textarea.focus(); };
    $<HTMLButtonElement>(".nb-close").onclick = () => this.close();
    this.input.keyboard!.on("keydown-ESC", () => this.close());
    this.events.once("shutdown", () => {
      this.input.keyboard?.removeAllListeners();
      this.root?.remove();
      this.root = undefined;
      this.onClose?.();
    });
    this.lastRound = this.notes.round;
    this.time.delayedCall(50, () => this.textarea.focus());
  }

  private submit() {
    const text = this.textarea.value.trim();
    if (!text) { this.textarea.focus(); return; }
    this.room.send("notes:submit", { text });
    this.editing = false;
    Sound.play("drop");
  }

  update() {
    if (!this.root) return;
    const notes = this.notes;
    const me = this.room.sessionId;
    const mineIn = notes.submitted.get(me) === true;
    const friend = this.friend();

    // A reveal just happened: clear the box for the next round.
    if (notes.round !== this.lastRound) {
      this.lastRound = notes.round;
      this.textarea.value = "";
      this.textarea.dispatchEvent(new Event("input"));
      this.editing = false;
      Sound.play("ticket");
    }

    this.writeBox.hidden = mineIn && !this.editing;
    this.root.querySelector<HTMLElement>(".nb-write-label")!.hidden = notes.revealed.length === 0;
    this.waitingBox.hidden = !mineIn || this.editing;
    this.statusEl.textContent = !friend
      ? "Notes are revealed once you've both written one — invite your friend!"
      : notes.submitted.get(friend.id)
        ? `✓ ${friend.p.name} has pinned a note for you!${mineIn ? "" : " Write yours to read it."}`
        : `${friend.p.name} hasn't written a note yet.`;

    if (notes.revealed.length !== this.shownNotes) {
      this.shownNotes = notes.revealed.length;
      this.renderHistory([...notes.revealed]);
    }
  }

  /** Revealed notes, newest round first, each round's notes side by side. */
  private renderHistory(all: NoteEntry[]) {
    this.historyEl.replaceChildren();
    const rounds = [...new Set(all.map((n) => n.round))].sort((a, b) => b - a);
    rounds.forEach((round, i) => {
      const heading = document.createElement("div");
      heading.className = "nb-round";
      heading.textContent = i === 0 ? "Newest notes" : "Earlier";
      this.historyEl.appendChild(heading);
      const row = document.createElement("div");
      row.className = "nb-cards";
      for (const note of all.filter((n) => n.round === round)) {
        const card = document.createElement("div");
        card.className = "nb-card";
        const who = document.createElement("div");
        who.className = "nb-author";
        who.textContent = `From ${note.author}`;
        who.style.color = PLAYER_COLORS[note.color]?.main ?? "";
        const body = document.createElement("div");
        body.className = "nb-body";
        body.textContent = note.text; // textContent: shown as plain text, never as HTML
        card.append(who, body);
        row.appendChild(card);
      }
      this.historyEl.appendChild(row);
    });
  }

  private close() {
    this.scene.stop();
  }
}
