import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AuthUser, ROLES, Role } from "../models/types";

export function signToken(user: AuthUser): string {
  return jwt.sign({ role: user.role }, env.jwtSecret, {
    subject: String(user.id),
    expiresIn: env.jwtExpiresIn,
    algorithm: "HS256",
  });
}

/** Returns the caller, or null if the token is missing, expired or tampered with. */
export function verifyToken(token: string): AuthUser | null {
  try {
    const payload = jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"] }) as jwt.JwtPayload;
    const id = Number(payload.sub);
    const role = payload.role as Role;
    if (!Number.isInteger(id) || !ROLES.includes(role)) return null;
    return { id, role };
  } catch {
    return null;
  }
}
