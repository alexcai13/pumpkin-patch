# Pumpkin Patch Pals

A cozy 2-player online pumpkin patch, in the style of an old handheld overworld.

```
client/   Phaser 4 game (Vite + TypeScript)       → http://localhost:8080
server/   Colyseus 0.18 game server (TypeScript)   → ws://localhost:2567
shared/   Plain TS used by both: map, constants, message shapes
```

## Run it

Two terminals:

```bash
cd server && npm start
```

```bash
cd client && npm run dev
```

Open http://localhost:8080 in two browser tabs (or on two computers on the same
Wi-Fi: use the "Network" URL Vite prints). One player clicks **Create Room** and
shares the code, the other types it and clicks **Join Room**.

## Where things live

| What | File |
| --- | --- |
| Map layout (edit me!) | `shared/map/patchMap.ts` |
| What each map character means | `shared/map/legend.ts` |
| Synced state (server is the source of truth) | `server/src/rooms/schema/*.ts` |
| Room logic | `server/src/rooms/PatchRoom.ts` |
| Generated pixel art | `client/src/game/art/` |
| Swapping in real art files | `client/public/assets/README.md` |
| Your movement | `client/src/game/world/PlayerController.ts` |
| Friend's smoothed movement | `client/src/game/net/Interpolator.ts` |
| Scenes (one per screen/activity) | `client/src/game/scenes/` |

## Controls

Arrows / WASD to walk, Shift to run, **E or Space** to use whatever you're
facing (a prompt shows when something's usable), **1-4** for emotes.

## Activities so far

| Activity | Where | Server (rules) | Client (visuals) |
| --- | --- | --- | --- |
| Emotes | anywhere, keys 1-4 | `activities/Emotes.ts` | `world/activities/EmoteView.ts` |
| Pumpkin picking race | Pumpkin Field sign | `activities/PickingRace.ts` | `world/activities/RaceView.ts`, `scenes/RaceHud.ts` |
| Carving station | tables on the porch | `activities/Carving.ts` | `scenes/Carving.ts`, `world/activities/PorchView.ts` |
| Look at carvings | finished pumpkins on the porch | (synced in state) | `scenes/CarvingViewer.ts` |
| Photo booth (live webcams, 3-photo strip) | inside the booth frame | `activities/PhotoBooth.ts` | `scenes/PhotoBooth.ts`, `net/BoothRtc.ts`, `art/boothArt.ts` |
| Cider stand benches | benches by the cider stand | `activities/Benches.ts` | `world/activities/BenchView.ts`, `scenes/CiderCozy.ts` |
| Hayride | wagon at the Hayride sign | `activities/Hayride.ts` | `world/activities/HayrideView.ts` |

Server paths are under `server/src/rooms/`, client paths under `client/src/game/`.
To add a new "press E here" action, register a provider with
`ctx.interactions.add(...)` (see `world/Interactions.ts`).

In development you can inspect the game from the browser console via
`__pumpkin.Network.room.state`.

**Photo booth cameras** need `localhost` or `https://` (browsers block cameras
on plain `http://192.168…` addresses), so use localhost for local testing; the
deployed https site works anywhere. Video goes directly between the two
browsers (WebRTC); the game server only passes the connection setup messages.

The server's address comes from `VITE_SERVER_URL` (set it when deploying). If
it's not set, the client uses port 2567 on the same host that served the page.
