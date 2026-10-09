import type { MapDef, Tile } from "./map/legend.js";

/**
 * CORN MAZE GENERATOR
 * -------------------
 * Builds a fresh maze from a number (the "seed"). The server picks the seed;
 * both clients run this same function with it, so everyone gets the exact
 * same maze without sending the whole map over the network.
 *
 * Algorithm: "recursive backtracker" — start in one cell, keep knocking down
 * the wall to a random unvisited neighbour, back up when stuck. It makes a
 * "perfect" maze (exactly one route between any two spots) with long,
 * winding corridors, which is great for co-op navigating.
 *
 * Tiles: "C" = corn wall, "=" = dirt path, ":" = start/exit clearings.
 */

/** Cells across / down. The tile map is (2 * cells + 1) in each direction. */
export const MAZE_CELLS_W = 17;
export const MAZE_CELLS_H = 12;

export interface Maze {
  map: MapDef;
  /** Where the two players start (bottom clearing). */
  start: Tile[];
  /** The exit tiles (top clearing). Both players must stand in it to win. */
  exit: { x: number; y: number; w: number; h: number };
  width: number;
  height: number;
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export function generateMaze(seed: number): Maze {
  const random = rng(seed);
  const W = MAZE_CELLS_W * 2 + 1;
  // Two extra rows at the top and bottom for the exit and start clearings.
  const H = MAZE_CELLS_H * 2 + 1 + 4;
  const grid: string[][] = Array.from({ length: H }, () => Array(W).fill("C"));
  const top = 2; // first maze row (rows 0-1 are the exit clearing)

  // Carve the maze with an explicit stack (no recursion limits).
  const visited = Array.from({ length: MAZE_CELLS_H }, () => Array(MAZE_CELLS_W).fill(false));
  const cellTile = (cx: number, cy: number) => ({ x: cx * 2 + 1, y: top + cy * 2 + 1 });
  const startCell = { x: Math.floor(MAZE_CELLS_W / 2), y: MAZE_CELLS_H - 1 };
  const stack = [startCell];
  visited[startCell.y][startCell.x] = true;
  const t0 = cellTile(startCell.x, startCell.y);
  grid[t0.y][t0.x] = "=";
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const options = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([dx, dy]) => ({ x: cur.x + dx, y: cur.y + dy }))
      .filter((n) => n.x >= 0 && n.y >= 0 && n.x < MAZE_CELLS_W && n.y < MAZE_CELLS_H && !visited[n.y][n.x]);
    if (options.length === 0) { stack.pop(); continue; }
    const next = options[Math.floor(random() * options.length)];
    visited[next.y][next.x] = true;
    const a = cellTile(cur.x, cur.y), b = cellTile(next.x, next.y);
    grid[(a.y + b.y) / 2][(a.x + b.x) / 2] = "=";
    grid[b.y][b.x] = "=";
    stack.push(next);
  }

  // A few extra openings so there's more than one way around (less frustrating).
  for (let i = 0; i < 10; i++) {
    const x = 2 + Math.floor(random() * (W - 4));
    const y = top + 2 + Math.floor(random() * (MAZE_CELLS_H * 2 - 3));
    const horizontalWall = grid[y][x - 1] === "=" && grid[y][x + 1] === "=" && grid[y - 1][x] === "C" && grid[y + 1][x] === "C";
    const verticalWall = grid[y - 1][x] === "=" && grid[y + 1][x] === "=" && grid[y][x - 1] === "C" && grid[y][x + 1] === "C";
    if (horizontalWall || verticalWall) grid[y][x] = "=";
  }

  // Exit: a gap in the top wall above a random top-row cell, into a clearing.
  const exitCell = cellTile(Math.floor(random() * MAZE_CELLS_W), 0);
  grid[top][exitCell.x] = "=";
  const exit = { x: exitCell.x - 1, y: 0, w: 3, h: 2 };
  for (let y = exit.y; y < exit.y + exit.h; y++) for (let x = exit.x; x < exit.x + exit.w; x++) grid[y][x] = ":";

  // Start: a clearing below the bottom wall, opening into the start cell.
  const startY = top + MAZE_CELLS_H * 2;
  grid[startY][t0.x] = "=";
  for (let y = startY + 1; y < H; y++) for (let x = t0.x - 1; x <= t0.x + 1; x++) grid[y][x] = ":";
  const start = [{ x: t0.x - 1, y: H - 1 }, { x: t0.x + 1, y: H - 1 }];

  // Bottom row stays solid except the clearing; keep left/right borders solid.
  const rows = grid.map((r) => r.join(""));
  return {
    map: { rows, props: [], spawns: start },
    start,
    exit,
    width: W,
    height: H,
  };
}
