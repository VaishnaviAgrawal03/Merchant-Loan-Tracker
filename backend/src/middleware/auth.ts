import { NextFunction, Request, Response } from "express";
import { AuthUser, Role } from "../models/types";
import { AppError } from "../utils/AppError";
import { verifyToken } from "../utils/jwt";

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}

/** Reads "Authorization: Bearer <jwt>" and attaches the caller to req.user. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const user = token ? verifyToken(token) : null;
  if (!user) return next(new AppError(401, "Unauthorized"));
  req.user = user;
  return next();
}

export function requireRole(role: Role) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (req.user?.role !== role) return next(new AppError(403, "Forbidden"));
    return next();
  };
}

/** Use inside handlers that run after requireAuth. */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw new AppError(401, "Unauthorized");
  return req.user;
}
