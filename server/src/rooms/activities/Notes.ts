import type { Client } from "colyseus";
import type { PatchRoom } from "../PatchRoom.js";
import { NotesState, NoteEntry } from "../schema/ActivityState.js";
import { NOTE_MAX } from "../../../../shared/constants.js";

/**
 * NOTE BOARD
 * Each player writes a note ("notes:submit"). The text stays on the server —
 * only the "submitted" flag is synced — until everyone in the room has
 * written one; then all notes of that round are revealed to both players at
 * once. "notes:new" starts another round (the old notes stay readable).
 */
export class Notes {
  /** This round's notes, kept private until the reveal. */
  private pending = new Map<string, string>();

  constructor(private room: PatchRoom) {
    room.state.notes = new NotesState();
    room.onMessage("notes:submit", (client: Client, msg: { text: string }) => this.submit(client, msg?.text));
    room.onMessage("notes:new", () => this.newRound());
  }

  private get n() { return this.room.state.notes; }

  private submit(client: Client, raw: unknown) {
    const player = this.room.state.players.get(client.sessionId);
    if (!player) return;
    // Plain text only: trim, strip control characters, cap the length.
    const text = String(raw ?? "").replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").trim().slice(0, NOTE_MAX);
    if (!text) return;
    this.pending.set(client.sessionId, text);
    this.n.submitted.set(client.sessionId, true);
    this.maybeReveal();
  }

  /** Reveal once every connected player has written (needs 2 players). */
  private maybeReveal() {
    const ids = [...this.room.state.players.entries()].filter(([, p]) => p.connected).map(([id]) => id);
    if (ids.length < 2 || !ids.every((id) => this.pending.has(id))) return;
    for (const id of ids) {
      const p = this.room.state.players.get(id)!;
      this.n.revealed.push(new NoteEntry({ round: this.n.round, author: p.name, color: p.color, text: this.pending.get(id)! }));
    }
    this.pending.clear();
    this.n.submitted.clear();
    this.room.broadcast("toast", { text: "💌 Your notes are ready — read them at the note board!" });
    this.room.farmer.progress("note");
    this.n.round++;
  }

  /** Throw away unrevealed drafts and start fresh (e.g. someone changed their mind). */
  private newRound() {
    this.pending.clear();
    this.n.submitted.clear();
  }

  onPlayerLeave(sessionId: string) {
    this.pending.delete(sessionId);
    this.n.submitted.delete(sessionId);
  }
}
