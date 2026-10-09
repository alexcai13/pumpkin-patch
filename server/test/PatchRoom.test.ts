import assert from "assert";
import { ColyseusTestServer, boot } from "@colyseus/testing";

import appConfig from "../src/app.config.js";
import type { PatchState } from "../src/rooms/schema/PatchState.js";
import { PATCH_MAP } from "../../shared/map/patchMap.js";
import { TILE } from "../../shared/constants.js";

describe("PatchRoom", () => {
  let colyseus: ColyseusTestServer<typeof appConfig>;

  before(async () => colyseus = await boot(appConfig));
  after(async () => colyseus.shutdown());
  beforeEach(async () => colyseus.cleanup());

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
