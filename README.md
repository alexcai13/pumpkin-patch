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

The server's address comes from `VITE_SERVER_URL` (set it when deploying). If
it's not set, the client uses port 2567 on the same host that served the page.
