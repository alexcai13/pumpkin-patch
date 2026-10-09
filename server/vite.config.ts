import { defineConfig } from "vite";
import { colyseus } from "colyseus/vite";

export default defineConfig(({ mode }) => ({
  build: { outDir: "dist/client" },
  // In development the Colyseus server runs inside Vite's dev server, so this
  // is the game server's port. `host: true` lets other computers on your
  // Wi-Fi connect too. `cors` lets the game client (served from a different
  // port, e.g. 8080) call the matchmaker, which sends credentials.
  server: { port: 2567, strictPort: true, host: true, cors: { origin: true, credentials: true } },
  plugins: [
    // The plugin declares a second build environment (dist/server), so every
    // `vite build` builds both halves. `--mode client` drops it when you only
    // want the static client — e.g. deploying it separately from the server.
    // That mode also swaps which .env.* file Vite loads: .env.client, not
    // .env.production. Only matters once you add a VITE_-prefixed var.
    ...(mode === "client" ? [] : [colyseus({ serverEntry: "/src/app.config.ts" })]),
  ],
}));
