import { createServer } from "http";
import app from "./app";
import { initSocket, registerRideQueueHandlers } from "./lib/socket";
import { startCron } from "./lib/cron";
import { logger } from "./lib/logger";
import { setSocketIO, onDriverReject, onDriverAccept } from "./lib/rideQueue";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = createServer(app);
const socketIO = initSocket(httpServer);

/* Wire rideQueue ↔ socket (no circular imports) */
setSocketIO(socketIO);
registerRideQueueHandlers({ onDriverReject, onDriverAccept });

startCron();

httpServer.listen(port, () => {
  logger.info({ port }, "Server listening with Socket.io");
});
