/** True when SQLite rejected a write because it would break a UNIQUE constraint (e.g. two requests raced). */
export const isUniqueViolation = (err: unknown): boolean =>
  typeof err === "object" && err !== null && (err as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE";
