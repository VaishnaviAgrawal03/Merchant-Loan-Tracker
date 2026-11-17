import { Router } from "express";
import { ApplicationService } from "../services/applicationService";
import { AuthService } from "../services/authService";
import { applicationRoutes, summaryRoutes } from "./applicationRoutes";
import { authRoutes } from "./authRoutes";

export function apiRouter(services: { auth: AuthService; applications: ApplicationService }): Router {
  const router = Router();
  router.use("/auth", authRoutes(services.auth));
  router.use("/applications", applicationRoutes(services.applications));
  router.use("/summary", summaryRoutes(services.applications));
  return router;
}
