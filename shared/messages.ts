/**
 * Shapes of the messages the client and server send each other
 * (outside of the automatically-synced room state).
 */

/** Client → server, ~15x/sec: "here's where my character is now". */
export interface MoveMessage {
  x: number;
  y: number;
  dir: number;      // see Dir in constants.ts
  moving: boolean;  // play the walk animation?
  running: boolean; // play it faster?
}

/** Server → one client: "you ended up somewhere invalid, go here instead". */
export interface CorrectMessage {
  x: number;
  y: number;
}

/** Options the client passes when creating or joining a room. */
export interface JoinOptions {
  name: string;
  color: number;
}

/** Client → server: show an emote. `kind` is an index into EMOTES. */
export interface EmoteMessage { kind: number }
/** Server → all clients: someone emoted. */
export interface EmoteBroadcast { sessionId: string; kind: number }

/** Client → server: pick the field pumpkin with this id (during a race). */
export interface PickMessage { id: string }

/** Client → server: finished carving. `mask` is from encodeCarving(). */
export interface CarveMessage { mask: string }

/** Client → server: sit on this bench (prop id). */
export interface SitMessage { bench: string }

/** Server → one client: you've been moved (dismounting, standing up...). */
export type TeleportMessage = CorrectMessage;
