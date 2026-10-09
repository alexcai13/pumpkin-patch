import { ColyseusTestServer, boot } from "@colyseus/testing";
import appConfig from "../src/app.config.js";

/**
 * One test server shared by every test file (only one can listen at a time).
 * Import `colyseus` from here; it's set before the first test runs.
 */
export let colyseus: ColyseusTestServer<typeof appConfig>;
before(async () => { colyseus = await boot(appConfig); });
after(async () => colyseus.shutdown());
beforeEach(async () => colyseus.cleanup());
