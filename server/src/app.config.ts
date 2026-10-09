import {
  defineServer,
  defineRoom,
  monitor,
  playground,
} from "colyseus";

/**
 * Import your Room files
 */
import { PatchRoom } from "./rooms/PatchRoom.js";

const server = defineServer({

  /**
   * Define your room handlers:
   */
  rooms: {
    // One room = one pumpkin patch shared by up to 2 friends.
    // The client creates it with client.create("patch") and joins with
    // client.joinById(CODE).
    patch: defineRoom(PatchRoom),
  },

  /**
   * Bind your custom express routes here:
   * Read more: https://expressjs.com/en/starter/basic-routing.html
   */
  express: (app) => {

    // Simple health check (handy for Render / Fly.io in phase 7).
    app.get("/health", (_req, res) => {
      res.send("ok");
    });

    /**
     * Use @colyseus/monitor
     * If you expose it in production, make sure to protect it with a password:
     * https://docs.colyseus.io/tools/monitoring#password-protection
     */
    if (process.env.NODE_ENV !== "production") {
      app.use("/monitor", monitor());
    }

    /**
     * Use @colyseus/playground
     * (It is not recommended to expose this route in a production environment)
     */
    if (process.env.NODE_ENV !== "production") {
      app.use("/playground", playground());
    }
  }
});

export default server;

/** Named export read by the `colyseus/vite` plugin's `serverEntry`. */
export { server };
