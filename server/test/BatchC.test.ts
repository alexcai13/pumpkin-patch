import assert from "assert";
import { colyseus } from "./_server.js";
import type { PatchState } from "../src/rooms/schema/PatchState.js";
import { PATCH_MAP } from "../../shared/map/patchMap.js";
import { TILE } from "../../shared/constants.js";
import { prizeById } from "../../shared/prizes.js";
import { FARMER_TASKS } from "../../shared/tasks.js";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const at = (p: any, tx: number, ty: number) => { p.x = tx * TILE + 8; p.y = ty * TILE + 8; };

describe("Batch C", () => {
  it("prize stand: can't buy without tickets; buying spends tickets and equips", async () => {
    const room = await colyseus.createRoom<PatchState>("patch", {});
    const a = await colyseus.connectTo(room, { name: "A" });
    const p = room.state.players.get(a.sessionId)!;
    const stand = PATCH_MAP.props.find((x) => x.id === "prizeStand")!;
    at(p, stand.x + 2, stand.y + stand.h);
    a.send("shop:buy", { id: "witchhat" });
    await wait(60);
    assert.strictEqual(p.hat, "", "too poor");
    p.tickets = 50;
    a.send("shop:buy", { id: "witchhat" });
    await wait(60);
    assert.strictEqual(p.hat, "witchhat");
    assert.strictEqual(p.tickets, 50 - prizeById("witchhat")!.cost);
    a.send("shop:equip", { id: "" });
    await wait(60);
    assert.strictEqual(p.hat, "", "hat off");
    a.send("shop:equip", { id: "gold" });
    await wait(60);
    assert.strictEqual(p.pumpkinColor, "orange", "can't equip what you don't own");
  });

  it("farmer: finishing a task rewards everyone and picks a new one", async () => {
    const room = await colyseus.createRoom<PatchState>("patch", {});
    const a = await colyseus.connectTo(room, { name: "A" });
    const farmer = (room as any).farmer;
    room.state.farmer.taskId = "carve"; room.state.farmer.progress = 0; room.state.farmer.goal = 1;
    farmer.progress("carve");
    const reward = FARMER_TASKS.find((t) => t.id === "carve")!.reward;
    assert.strictEqual(room.state.players.get(a.sessionId)!.tickets, reward);
    await wait(4200);
    assert.ok(room.state.farmer.taskId && room.state.farmer.taskId !== "carve");
  }).timeout(8000);

  it("farmer: hand over picked pumpkins for the pumpkin task", async () => {
    const room = await colyseus.createRoom<PatchState>("patch", {});
    const a = await colyseus.connectTo(room, { name: "A" });
    const p = room.state.players.get(a.sessionId)!;
    room.state.farmer.taskId = "pumpkins"; room.state.farmer.progress = 0; room.state.farmer.goal = 5;
    const pumpkin = [...room.state.pumpkins.values()][0];
    at(p, pumpkin.tx, pumpkin.ty);
    a.send("race:pick", { id: pumpkin.id }); // outside a race is fine now
    await wait(60);
    assert.ok(p.carrying === "small" || p.carrying === "big");
    const f = PATCH_MAP.props.find((x) => x.id === "farmer")!;
    at(p, f.x, f.y + 1);
    a.send("farmer:give");
    await wait(60);
    assert.strictEqual(p.carrying, "");
    assert.strictEqual(room.state.farmer.progress, 1);
  });

  it("crow: steals a pumpkin and is caught by running into it", async () => {
    const room = await colyseus.createRoom<PatchState>("patch", {});
    const a = await colyseus.connectTo(room, { name: "A" });
    const crow = (room as any).crow;
    crow.waitLeft = 0;
    for (let i = 0; i < 400 && room.state.crow.phase !== "fleeing"; i++) crow.update(50);
    assert.strictEqual(room.state.crow.phase, "fleeing");
    assert.ok(room.state.crow.carrying);
    const p = room.state.players.get(a.sessionId)!;
    p.x = room.state.crow.x; p.y = room.state.crow.y; // pounce!
    crow.update(50);
    assert.strictEqual(room.state.crow.phase, "leaving");
    assert.ok(p.tickets > 0);
  });
});
