import { Client, Room } from "@colyseus/sdk";
import type { PatchState } from "../../../../server/src/rooms/schema/PatchState";
import type { JoinOptions } from "../../../../shared/messages";

/**
 * Where the game server lives.
 * - In production set VITE_SERVER_URL (e.g. wss://pumpkin-server.onrender.com).
 * - Locally it defaults to port 2567 on whatever host served this page, so a
 *   second computer on the same Wi-Fi can open http://<your-ip>:8080 and still
 *   reach the server.
 */
export const SERVER_URL: string =
  import.meta.env.VITE_SERVER_URL ||
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:2567`;

export type PatchRoom = Room<any, PatchState>;

/**
 * One shared connection for the whole game. Scenes read `Network.room` to
 * send messages and listen to state.
 */
class NetworkManager {
  readonly client = new Client(SERVER_URL);
  room: PatchRoom | null = null;

  async createRoom(options: JoinOptions) {
    this.room = await this.client.create<PatchState>("patch", options);
    await this.afterJoin();
    return this.room;
  }

  async joinRoom(code: string, options: JoinOptions) {
    this.room = await this.client.joinById<PatchState>(normalizeCode(code), options);
    await this.afterJoin();
    return this.room;
  }

  /** Wait for the first full copy of the room state, so scenes can read it right away. */
  private async afterJoin() {
    const room = this.room!;
    this.watchUnload();
    if (room.state?.players === undefined || room.state.hayride === undefined) {
      await new Promise<void>((resolve) => room.onStateChange.once(() => resolve()));
    }
  }

  /**
   * When the tab closes or refreshes, leave on purpose. Otherwise the server
   * would think we merely dropped, and hold our seat (blocking a rejoin) for a
   * few seconds.
   */
  private watchUnload() {
    window.addEventListener("beforeunload", () => this.room?.leave(true), { once: true });
  }
}

export const Network = new NetworkManager();

/** Codes are shown uppercase; accept "pump42", " PUMP 42 ", etc. */
export function normalizeCode(code: string) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Turns a Colyseus error into something friendly for the title screen. */
export function describeJoinError(err: unknown): string {
  const message = String((err as any)?.message ?? err ?? "");
  if (/not found|invalid|no rooms/i.test(message)) return "No patch found with that code. Check it and try again!";
  if (/full|locked/i.test(message)) return "That patch already has 2 friends in it.";
  if (/ECONNREFUSED|failed to fetch|network|websocket/i.test(message) || message === "") {
    return "Can't reach the game server. Is it running? (cd server && npm start)";
  }
  return message;
}
