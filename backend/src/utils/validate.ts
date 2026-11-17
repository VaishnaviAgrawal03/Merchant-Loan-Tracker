import { z } from "zod";
import { AppError } from "./AppError";

/**
 * Parses untrusted input with a Zod schema, or throws a 400 with { field: [messages] } details.
 * Errors about the input as a whole (e.g. an array instead of an object) are reported under "body".
 */
export function validate<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const { fieldErrors, formErrors } = result.error.flatten();
    const details = formErrors.length > 0 ? { ...fieldErrors, body: formErrors } : fieldErrors;
    throw new AppError(400, "Validation failed", details);
  }
  return result.data;
}

/** Route ids must be plain digits: "1e2", "0x10" and "1.0" are rejected even though Number() accepts them. */
export function parseId(raw: string): number {
  const id = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(id) || id < 1) throw new AppError(400, "Invalid id");
  return id;
}
