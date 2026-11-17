import rateLimit from "express-rate-limit";
import { env } from "../config/env";

/** Slows down password guessing: 20 login/register attempts per minute per IP. */
export const authRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many attempts, please try again in a minute" },
  skip: () => env.isTest,
});
