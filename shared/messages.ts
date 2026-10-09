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
