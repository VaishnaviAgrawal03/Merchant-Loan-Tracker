import { createApp } from "./app";
import { env } from "./config/env";
import { createDb } from "./db/database";
import { seedDemoUsers } from "./seed";

const db = createDb(env.dbPath);
const { app, repositories } = createApp(db);
if (!env.isProduction) seedDemoUsers(repositories.users);

const server = app.listen(env.port, () => {
  console.log(`API listening on http://localhost:${env.port} (db: ${env.dbPath})`);
});

const SHUTDOWN_TIMEOUT_MS = 10_000;
let shuttingDown = false;

// Graceful shutdown: stop taking new requests, finish in-flight ones, then close the database.
// If requests are still hanging after 10 seconds, exit anyway so the process never gets stuck.
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down`);
  setTimeout(() => {
    console.error(`Forcing exit: connections still open after ${SHUTDOWN_TIMEOUT_MS / 1000}s`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
