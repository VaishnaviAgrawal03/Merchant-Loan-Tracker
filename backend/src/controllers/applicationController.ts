import { Request, Response } from "express";
import { z } from "zod";
import { currentUser } from "../middleware/auth";
import { STATUSES } from "../models/types";
import { ApplicationService } from "../services/applicationService";
import { AppError } from "../utils/AppError";
import { parseId, validate } from "../utils/validate";

const MAX_PAISE = 1_000_000_000_000; // ₹1,000 crore: a sanity ceiling, not a business rule

const loanRequestSchema = z.object({
  principalPaise: z.number().int().positive().max(MAX_PAISE),
  tenureMonths: z.number().int().min(1).max(120),
  monthlyRevenuePaise: z.number().int().positive().max(MAX_PAISE),
  yearsInBusiness: z.number().int().min(0).max(200),
});

const applySchema = loanRequestSchema.extend({
  // React escapes output on screen; stripping angle brackets is defence in depth against stored XSS.
  businessName: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .transform((s) => s.replace(/[<>]/g, "").trim())
    .refine((s) => s.length > 0, "Business name is required"),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z.enum(STATUSES).optional(),
  search: z.string().trim().max(80).optional(),
});

const transitionSchema = z.object({
  to: z.enum(STATUSES),
  note: z.string().trim().max(500).optional(),
});

export function createApplicationController(service: ApplicationService) {
  return {
    quote(req: Request, res: Response) {
      res.json(service.quote(validate(loanRequestSchema, req.body)));
    },

    create(req: Request, res: Response) {
      const input = validate(applySchema, req.body);
      const key = req.header("Idempotency-Key") || undefined;
      if (key && key.length > 100) throw new AppError(400, "Idempotency-Key must be at most 100 characters");
      const { application, created } = service.create(currentUser(req), input, key);
      res.status(created ? 201 : 200).json(application);
    },

    list(req: Request, res: Response) {
      res.json(service.list(currentUser(req), validate(listQuerySchema, req.query)));
    },

    get(req: Request, res: Response) {
      res.json(service.get(currentUser(req), parseId(req.params.id)));
    },

    schedule(req: Request, res: Response) {
      res.json(service.schedule(currentUser(req), parseId(req.params.id)));
    },

    events(req: Request, res: Response) {
      res.json(service.events(currentUser(req), parseId(req.params.id)));
    },

    transition(req: Request, res: Response) {
      const body = validate(transitionSchema, req.body);
      res.json(service.transition(currentUser(req), parseId(req.params.id), body.to, body.note || undefined));
    },

    summary(req: Request, res: Response) {
      const { counts, cached } = service.summary(currentUser(req));
      res.set("X-Cache", cached ? "HIT" : "MISS").json(counts);
    },
  };
}
