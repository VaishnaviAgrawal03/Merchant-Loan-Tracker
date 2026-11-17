import { randomUUID } from "crypto";
import { NextFunction, Request, Response } from "express";
import { env } from "../config/env";

// UUID-like: groups of hex digits joined by single hyphens, at most 64 characters.
const REQUEST_ID = /^[0-9a-f]+(-[0-9a-f]+)*$/i;
const MAX_REQUEST_ID_LENGTH = 64;

/** A caller-supplied id is reused for tracing only if it looks safe to log and echo; otherwise we make our own. */
export function pickRequestId(supplied: string | undefined): string {
  return supplied && supplied.length <= MAX_REQUEST_ID_LENGTH && REQUEST_ID.test(supplied) ? supplied : randomUUID();
}

/** Gives every request an id (returned as X-Request-Id) and logs one JSON line when it finishes. */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const requestId = pickRequestId(req.header("X-Request-Id"));
  const started = process.hrtime.bigint();
  res.locals.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  res.on("finish", () => {
    if (env.isTest) return;
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    console.log(
      JSON.stringify({
        level: res.statusCode >= 500 ? "error" : "info",
        requestId,
        method: req.method,
        path: req.originalUrl.split("?")[0],
        status: res.statusCode,
        ms: Math.round(ms * 10) / 10,
      }),
    );
  });
  next();
}
