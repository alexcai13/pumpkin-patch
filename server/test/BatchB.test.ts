import assert from "assert";
import { colyseus } from "./_server.js";
import type { PatchState } from "../src/rooms/schema/PatchState.js";
import { PATCH_MAP } from "../../shared/map/patchMap.js";
import { TILE, Dir, TICKETS, MINIGAMES } from "../../shared/constants.js";
import { generateMaze } from "../../shared/maze.js";
import { rollBowling, tossDistance, PINS, appleInTarget } from "../../shared/minigames.js";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const at = (p: any, tx: number, ty: number) => { p.x = tx * TILE + 8; p.y = ty * TILE + 8; };


describe("Batch B", () => {
  it("giant pumpkin: one pusher can't move it, two can", async () => {
    const room = await colyseus.createRoom<PatchState>("patch", {});
    const a = await colyseus.connectTo(room, { name: "A" });
    const b = await colyseus.connectTo(room, { name: "B" });
    const g = room.state.giant;
    const startX = g.tx;
    // Both stand on the right side, pushing left.
    at(room.state.players.get(a.sessionId), g.tx + 2, g.ty);
    at(room.state.players.get(b.sessionId), g.tx + 2, g.ty + 1);
    a.send("giant:push", { dir: Dir.Left });
    await wait(80);
    assert.strictEqual(g.tx, startX, "alone: too heavy");
    b.send("giant:push", { dir: Dir.Left });
    await wait(80);
    assert.strictEqual(g.tx, startX - 1, "together: it rolls");
  });

  it("scarecrow: find all three parts and build it", async () => {
    const room = await colyseus.createRoom<PatchState>("patch", {});
    const a = await colyseus.connectTo(room, { name: "A" });
    const p = room.state.players.get(a.sessionId);
    const post = PATCH_MAP.props.find((x) => x.id === "scarecrowPost")!;
    for (const kind of ["hat", "shirt", "stuffing"]) {
      const part = room.state.scarecrow.parts.get(kind)!;
      at(p, part.tx, part.ty);
      a.send("scarecrow:pick", { kind });
      await wait(60);
      assert.strictEqual(p.carrying, kind);
      at(p, post.x, post.y + 1);
      a.send("scarecrow:place");
      await wait(60);
    }
    assert.ok(room.state.scarecrow.built);
    assert.strictEqual(p.tickets, TICKETS.scarecrow);
  });

  it("corn maze: everyone in line starts it; both in the exit finishes it", async () => {
    const room = await colyseus.createRoom<PatchState>("patch", {});
    const a = await colyseus.connectTo(room, { name: "A" });
    const b = await colyseus.connectTo(room, { name: "B" });
    const e = PATCH_MAP.mazeEntrance!;
    at(room.state.players.get(a.sessionId), e.x, e.y + 2);
    at(room.state.players.get(b.sessionId), e.x + 1, e.y + 2);
    a.send("maze:enter");
    await wait(60);
    assert.strictEqual(room.state.maze.phase, "idle", "waits for the friend");
    b.send("maze:enter");
    await wait(60);
    assert.strictEqual(room.state.maze.phase, "running");
    // Skip the walking: put both in the exit.
    const maze = generateMaze(room.state.maze.seed);
    for (const c of [a, b]) {
      const mp = room.state.maze.players.get(c.sessionId)!;
      mp.x = (maze.exit.x + 1) * TILE + 8; mp.y = (maze.exit.y + 1) * TILE + 8 + 16; // just below the exit
      c.send("maze:move", { x: (maze.exit.x + 1) * TILE + 8, y: (maze.exit.y + 1) * TILE + 8, dir: Dir.Up, moving: true, running: false });
    }
    await wait(80);
    assert.strictEqual(room.state.maze.phase, "done");
    assert.ok(room.state.maze.finishMs > 0);
  });

  it("corn maze: leaving takes only you out; your friend can still finish alone", async () => {
    const room = await colyseus.createRoom<PatchState>("patch", {});
    const a = await colyseus.connectTo(room, { name: "A" });
    const b = await colyseus.connectTo(room, { name: "B" });
    const e = PATCH_MAP.mazeEntrance!;
    at(room.state.players.get(a.sessionId), e.x, e.y + 2);
    at(room.state.players.get(b.sessionId), e.x + 1, e.y + 2);
    a.send("maze:enter"); b.send("maze:enter");
    await wait(80);
    assert.strictEqual(room.state.maze.phase, "running");
    a.send("maze:leave");
    await wait(60);
    assert.strictEqual(room.state.maze.phase, "running", "B is still in");
    assert.ok(!room.state.maze.players.has(a.sessionId));
    const maze = generateMaze(room.state.maze.seed);
    const mp = room.state.maze.players.get(b.sessionId)!;
    mp.x = (maze.exit.x + 1) * TILE + 8; mp.y = (maze.exit.y + 1) * TILE + 8 + 16;
    b.send("maze:move", { x: (maze.exit.x + 1) * TILE + 8, y: (maze.exit.y + 1) * TILE + 8, dir: Dir.Up, moving: true, running: false });
    await wait(80);
    assert.strictEqual(room.state.maze.phase, "done", "B finished alone");
  });

  it("bowling physics: a straight full-power roll knocks pins; a hard-angled one gutters", () => {
    const straight = rollBowling({ aim: 0, power: 1 }, 1);
    assert.ok(straight.knocked.length >= 3, `knocked ${straight.knocked.length}`);
    assert.ok(straight.knocked.includes(0), "head pin");
    const wide = rollBowling({ aim: 0.16, power: 1 }, 1);
    assert.ok(wide.gutter);
    assert.strictEqual(PINS.length, 10);
  });

  it("hay toss physics: 45 degrees goes furthest", () => {
    assert.ok(tossDistance({ angle: 45, power: 1 }) > tossDistance({ angle: 20, power: 1 }));
    assert.ok(tossDistance({ angle: 45, power: 1 }) > tossDistance({ angle: 45, power: 0.5 }));
  });

  it("bowling game: 3 turns each, then results and a winner", async () => {
    const room = await colyseus.createRoom<PatchState>("patch", {});
    const a = await colyseus.connectTo(room, { name: "A" });
    const st = PATCH_MAP.stations!.bowling;
    at(room.state.players.get(a.sessionId), st.x, st.y);
    a.send("mg:open", { game: "bowling" });
    await wait(60);
    assert.strictEqual(room.state.minigame.phase, "lobby");
    a.send("mg:start");
    await wait(60);
    assert.strictEqual(room.state.minigame.phase, "playing");
    for (let i = 0; i < MINIGAMES.bowling.turns; i++) {
      // Wait for our turn (the server pauses between throws for the animation).
      for (let t = 0; t < 100 && room.state.minigame.turn !== a.sessionId; t++) await wait(50);
      a.send("mg:throw", { aim: 0, power: 1 });
      await wait(100);
    }
    for (let t = 0; t < 100 && room.state.minigame.phase !== "results"; t++) await wait(50);
    assert.strictEqual(room.state.minigame.phase, "results");
    assert.ok(room.state.minigame.scores.get(a.sessionId)! > 0);
  }).timeout(30000);

  it("apple bobbing: a bite with an apple in the ring scores; a bad one gets you dunked", async () => {
    const room = await colyseus.createRoom<PatchState>("patch", {});
    const a = await colyseus.connectTo(room, { name: "A" });
    const st = PATCH_MAP.stations!.apples;
    at(room.state.players.get(a.sessionId), st.x - 1, st.y);
    a.send("mg:open", { game: "apples" });
    await wait(60);
    a.send("mg:start");
    await wait(60);
    const mg = room.state.minigame;
    await wait(Math.max(0, mg.startedAt - Date.now()) + 50);

    // Find upcoming moments with / without an apple in the ring (server clock).
    const findTime = (wantApple: boolean) => {
      for (let ms = Date.now() - mg.startedAt + 100; ; ms += 5) {
        const inRing = appleInTarget(mg.seed, 0, [0, 0, 0], ms) !== -1;
        // For "no apple" make sure there's none for the whole 250 ms look-back window.
        const clear = !wantApple && [...Array(30)].every((_, i) => appleInTarget(mg.seed, 0, [0, 0, 0], ms - i * 10) === -1);
        if (wantApple ? inRing : clear) return mg.startedAt + ms;
      }
    };
    const miss = findTime(false);
    await wait(miss - Date.now());
    a.send("apples:bite");
    await wait(60);
    assert.strictEqual(mg.scores.get(a.sessionId), 0, "missed bite scores nothing");

    await wait(900); // dunk penalty
    const hit = findTime(true);
    await wait(hit - Date.now() + 10);
    a.send("apples:bite");
    await wait(60);
    assert.strictEqual(mg.scores.get(a.sessionId), 1, "timed bite catches an apple");
  }).timeout(15000);
});

