import assert from "assert";
import { ColyseusTestServer, boot } from "@colyseus/testing";

import appConfig from "../src/app.config.js";
import type { PatchState } from "../src/rooms/schema/PatchState.js";
import { PATCH_MAP } from "../../shared/map/patchMap.js";
import { TILE, RACE, HAYRIDE, CARVE_W, CARVE_H } from "../../shared/constants.js";
import { encodeCarving, decodeCarving } from "../../shared/carving.js";

// One test server shared by every test below.
let colyseus: ColyseusTestServer<typeof appConfig>;
before(async () => colyseus = await boot(appConfig));
after(async () => colyseus.shutdown());
beforeEach(async () => colyseus.cleanup());

describe("PatchRoom", () => {
  it("uses a short room code as the room id", async () => {
    const room = await colyseus.createRoom<PatchState>("patch", {});
    assert.match(room.roomId, /^[A-Z0-9]{6}$/);
  });

  it("stores the player's name and color, and spawns them on the map", async () => {
    const room = await colyseus.createRoom<PatchState>("patch", {});
    const client = await colyseus.connectTo(room, { name: "  Sam<script>  ", color: 2 });
    const player = room.state.players.get(client.sessionId);
    assert.strictEqual(player.name, "Samscript");
    assert.strictEqual(player.color, 2);
    assert.strictEqual(player.x, PATCH_MAP.spawns[0].x * TILE + TILE / 2);
  });

  it("allows at most 2 players", async () => {
    const room = await colyseus.createRoom<PatchState>("patch", {});
    await colyseus.connectTo(room, { name: "A" });
    await colyseus.connectTo(room, { name: "B" });
    await assert.rejects(colyseus.connectTo(room, { name: "C" }));
  });

  it("accepts a small move and rejects a teleport", async () => {
    const room = await colyseus.createRoom<PatchState>("patch", {});
    const client = await colyseus.connectTo(room, { name: "A" });
    const player = room.state.players.get(client.sessionId);
    const startX = player.x;

    await new Promise((r) => setTimeout(r, 200)); // earn some movement budget
    client.send("move", { x: startX + 4, y: player.y, dir: 2, moving: true, running: false });
    await room.waitForNextMessage();
    assert.strictEqual(player.x, startX + 4);

    client.send("move", { x: startX + 500, y: player.y, dir: 2, moving: true, running: false });
    await room.waitForNextMessage();
    assert.strictEqual(player.x, startX + 4, "teleport was ignored");
  });
});

describe("Activities", () => {

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it("grows pumpkins in the field", async () => {
    const room = await colyseus.createRoom<PatchState>("patch", {});
    assert.strictEqual(room.state.pumpkins.size, RACE.smallPumpkins + RACE.bigPumpkins);
  });

  it("race: pick a pumpkin and deliver it to your basket", async () => {
    const room = await colyseus.createRoom<PatchState>("patch", {});
    const client = await colyseus.connectTo(room, { name: "A" });
    const player = room.state.players.get(client.sessionId);

    client.send("race:start"); // too far from the sign: ignored
    await room.waitForNextMessage();
    assert.strictEqual(room.state.race.phase, "idle");

    const sign = PATCH_MAP.props.find((p) => p.id === "signField")!;
    player.x = sign.x * TILE + 8; player.y = (sign.y - 1) * TILE + 8;
    client.send("race:start");
    await room.waitForNextMessage();
    assert.strictEqual(room.state.race.phase, "countdown");

    // Skip the countdown for the test.
    room.state.race.phase = "running";
    const pumpkin = [...room.state.pumpkins.values()].find((p) => !p.big)!;
    player.x = pumpkin.tx * TILE + 8; player.y = pumpkin.ty * TILE + 8;
    client.send("race:pick", { id: pumpkin.id });
    await room.waitForNextMessage();
    assert.strictEqual(player.carrying, "small");
    assert.strictEqual(pumpkin.picked, true);

    const basket = PATCH_MAP.props.find((p) => p.id === `basket${player.slot}`)!;
    player.x = basket.x * TILE + 8; player.y = (basket.y - 1) * TILE + 8;
    client.send("race:deliver");
    await room.waitForNextMessage();
    assert.strictEqual(player.raceScore, 1);
    assert.strictEqual(player.carrying, "");
  });

  it("carving: a valid carving near the table goes on the porch", async () => {
    const room = await colyseus.createRoom<PatchState>("patch", {});
    const client = await colyseus.connectTo(room, { name: "A" });
    const player = room.state.players.get(client.sessionId);
    player.x = 4 * TILE + 8; player.y = 10 * TILE + 8; // in front of a carving table

    const pixels = new Uint8Array(CARVE_W * CARVE_H);
    pixels[100] = 1;
    client.send("carve:submit", { mask: encodeCarving(pixels) });
    await room.waitForNextMessage();
    assert.strictEqual(room.state.carvings.length, 1);
    assert.strictEqual(decodeCarving(room.state.carvings[0].mask)[100], 1);

    client.send("carve:submit", { mask: "garbage" });
    await room.waitForNextMessage();
    assert.strictEqual(room.state.carvings.length, 1, "invalid carving ignored");
  });

  it("benches: sit and stand", async () => {
    const room = await colyseus.createRoom<PatchState>("patch", {});
    const client = await colyseus.connectTo(room, { name: "A" });
    const player = room.state.players.get(client.sessionId);
    player.x = 16 * TILE + 8; player.y = 9 * TILE + 8; // just below bench1
    client.send("bench:sit", { bench: "bench1" });
    await room.waitForNextMessage();
    assert.strictEqual(player.seat, "bench1:0");
    client.send("bench:stand");
    await room.waitForNextMessage();
    assert.strictEqual(player.seat, "");
    assert.strictEqual(player.y, 9 * TILE + 8);
  });

  it("hayride: boarding alone departs, riders follow the wagon", async () => {
    const room = await colyseus.createRoom<PatchState>("patch", {});
    const client = await colyseus.connectTo(room, { name: "A" });
    const player = room.state.players.get(client.sessionId);
    player.x = 30 * TILE + 8; player.y = 31 * TILE + 8; // just above the parked wagon
    client.send("hayride:board");
    await room.waitForNextMessage();
    assert.strictEqual(player.riding, 0);
    await wait(HAYRIDE.departDelaySeconds * 1000 + 300);
    assert.strictEqual(room.state.hayride.phase, "moving");
    client.send("hayride:hop"); // not allowed while moving
    await room.waitForNextMessage();
    assert.strictEqual(player.riding, 0);
    assert.ok(Math.abs(player.x - (room.state.hayride.x + HAYRIDE.seats[0].x)) < 0.01);
  });
});
