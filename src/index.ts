import http from "http";
import app from "./app";
import { initSocketServer } from "./game/socket-server";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = http.createServer(app);
initSocketServer(httpServer);

httpServer.listen(port, () => {
  logger.info({ port }, "Server listening with Socket.io");
});
