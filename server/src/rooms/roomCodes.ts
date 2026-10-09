/**
 * Short, friendly room codes like "PUMP42" or "CORN07".
 *
 * The code IS the Colyseus roomId, so the second player can join with
 * `client.joinById(code)`. We keep a set of codes currently in use so two live
 * rooms never share one.
 *
 * Note: this set lives in this server process's memory. That's fine for one
 * server instance (Render / Fly.io free tier). If you ever run several
 * instances you'd need a shared store (Colyseus supports Redis for that).
 */
const WORDS = ["PUMP", "CORN", "LEAF", "HAYR", "GOUR", "MAPL", "CIDR", "ACRN", "OWLS", "CROW"];
const inUse = new Set<string>();

export function claimRoomCode(): string {
  for (let attempt = 0; attempt < 200; attempt++) {
    const word = WORDS[Math.floor(Math.random() * WORDS.length)];
    const digits = String(Math.floor(Math.random() * 100)).padStart(2, "0");
    const code = word + digits;
    if (!inUse.has(code)) {
      inUse.add(code);
      return code;
    }
  }
  // Extremely unlikely (1000 rooms open at once): fall back to random letters.
  let code: string;
  do {
    code = Math.random().toString(36).slice(2, 8).toUpperCase();
  } while (inUse.has(code));
  inUse.add(code);
  return code;
}

export function releaseRoomCode(code: string) {
  inUse.delete(code);
}
