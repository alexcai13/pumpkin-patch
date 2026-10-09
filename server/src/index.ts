/**
 * Starts the game server as a plain Node process.
 *
 * `npm start` runs this with `tsx watch`, which RESTARTS the whole server
 * whenever you save any server or shared file. (The template's Vite-based dev
 * server tried to hot-swap rooms in place, which silently kept old code
 * running after schema changes.) Restarting kicks connected players back to
 * the title screen — just rejoin.
 *
 * In production (Render / Fly.io) the host sets PORT.
 */
import server from "./app.config.js";

const port = Number(process.env.PORT) || 2567;
server.listen(port).then(() => console.log(`🎃 Pumpkin Patch server listening on port ${port}`));
