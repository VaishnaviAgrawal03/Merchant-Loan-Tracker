import { Router } from "express";
import { createApplicationController } from "../controllers/applicationController";
import { requireAuth, requireRole } from "../middleware/auth";
import { ApplicationService } from "../services/applicationService";
import { asyncHandler } from "../utils/asyncHandler";

export function applicationRoutes(service: ApplicationService): Router {
  const c = createApplicationController(service);
  const router = Router();
  router.use(requireAuth);

  router.post("/quote", requireRole("merchant"), asyncHandler(c.quote));
  router.get("/", asyncHandler(c.list));
  router.post("/", requireRole("merchant"), asyncHandler(c.create));
  router.get("/:id", asyncHandler(c.get));
  router.get("/:id/schedule", asyncHandler(c.schedule));
  router.get("/:id/events", asyncHandler(c.events));
  router.post("/:id/transition", asyncHandler(c.transition));
  return router;
}

export function summaryRoutes(service: ApplicationService): Router {
  const c = createApplicationController(service);
  const router = Router();
  router.get("/", requireAuth, asyncHandler(c.summary));
  return router;
}
