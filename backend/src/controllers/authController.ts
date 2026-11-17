import { Request, Response } from "express";
import { z } from "zod";
import { currentUser } from "../middleware/auth";
import { AuthService } from "../services/authService";
import { validate } from "../utils/validate";

const email = z.string().trim().toLowerCase().email().max(120);

const registerSchema = z.object({
  email,
  name: z.string().trim().min(1).max(80),
  // bcrypt only uses the first 72 bytes of a password
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});

const loginSchema = z.object({
  email,
  password: z.string().min(1).max(72),
});

/** Controllers only translate HTTP <-> service calls. No business rules here. */
export function createAuthController(auth: AuthService) {
  return {
    async register(req: Request, res: Response) {
      const body = validate(registerSchema, req.body);
      res.status(201).json(await auth.register(body));
    },

    async login(req: Request, res: Response) {
      const body = validate(loginSchema, req.body);
      res.json(await auth.login(body.email, body.password));
    },

    me(req: Request, res: Response) {
      res.json(auth.me(currentUser(req)));
    },
  };
}
