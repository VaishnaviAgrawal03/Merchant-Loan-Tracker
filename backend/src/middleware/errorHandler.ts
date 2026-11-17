import { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/AppError";

export function notFound(_req: Request, _res: Response, next: NextFunction) {
  next(new AppError(404, "Route not found"));
}

/** One place that turns every error into a consistent JSON response. Internal details never leak to clients. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const requestId = res.locals.requestId as string | undefined;

  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, details: err.details, requestId });
  }

  const type = (err as { type?: string })?.type;
  if (type === "entity.parse.failed") return res.status(400).json({ error: "Malformed JSON body", requestId });
  if (type === "entity.too.large") return res.status(413).json({ error: "Request body is too large", requestId });

  console.error(JSON.stringify({ level: "error", requestId, message: (err as Error)?.message, stack: (err as Error)?.stack }));
  return res.status(500).json({ error: "Internal server error", requestId });
}
