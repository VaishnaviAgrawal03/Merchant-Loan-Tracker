import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { Db } from "./db/database";
import { errorHandler, notFound } from "./middleware/errorHandler";
import { requestLogger } from "./middleware/requestLogger";
import { createApplicationRepository } from "./repositories/applicationRepository";
import { createUserRepository } from "./repositories/userRepository";
import { apiRouter } from "./routes";
import { createApplicationService } from "./services/applicationService";
import { createAuthService } from "./services/authService";

/**
 * Builds the app from a database handle. Layers are wired by hand:
 * routes -> controllers -> services -> repositories -> SQLite.
 * Tests pass an in-memory database, so every test starts from a clean state.
 */
export function createApp(db: Db) {
  const repositories = {
    users: createUserRepository(db),
    applications: createApplicationRepository(db),
  };
  const services = {
    auth: createAuthService(repositories.users),
    applications: createApplicationService(repositories.applications),
  };

  const app = express();
  // Behind a load balancer, req.ip (used by the login rate limiter) is only the real client if we trust the proxy.
  app.set("trust proxy", env.trustProxy);
  app.use(helmet());
  app.use(
    cors({
      origin: env.allowedOrigins, // CORS allow-list: only our frontend may call the API from a browser
      methods: ["GET", "POST"],
      allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
      exposedHeaders: ["X-Request-Id", "X-Cache"],
    }),
  );
  app.use(express.json({ limit: "10kb" }));
  app.use(requestLogger);

  app.get("/health", (_req, res) => {
    db.prepare("SELECT 1").get();
    res.json({ status: "ok" });
  });
  app.use("/api", apiRouter(services));
  app.use(notFound);
  app.use(errorHandler);

  return { app, repositories, services };
}
