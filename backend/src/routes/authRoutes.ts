import { Router } from "express";
import { createAuthController } from "../controllers/authController";
import { requireAuth } from "../middleware/auth";
import { authRateLimiter } from "../middleware/rateLimiter";
import { AuthService } from "../services/authService";
import { asyncHandler } from "../utils/asyncHandler";

export function authRoutes(auth: AuthService): Router {
  const c = createAuthController(auth);
  const router = Router();
  router.post("/register", authRateLimiter, asyncHandler(c.register));
  router.post("/login", authRateLimiter, asyncHandler(c.login));
  router.get("/me", requireAuth, asyncHandler(c.me));
  return router;
}
