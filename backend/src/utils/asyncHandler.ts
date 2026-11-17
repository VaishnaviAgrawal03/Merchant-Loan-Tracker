import { NextFunction, Request, RequestHandler, Response } from "express";

/** Express 4 does not catch errors from async handlers, so every handler is wrapped. */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => unknown): RequestHandler =>
  (req, res, next) => {
    Promise.resolve()
      .then(() => fn(req, res, next))
      .catch(next);
  };
