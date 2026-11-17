type RawEnv = Record<string, string | undefined>;

const DEV_ONLY_JWT_SECRET = "dev-only-secret-change-me";

/**
 * Express "trust proxy" setting. Unset or "false" = trust nothing (req.ip is the socket address).
 * "true" = trust every proxy, a number = trust that many hops, anything else is passed through
 * (e.g. "loopback" or "10.0.0.0/8, 192.168.0.1").
 */
export function parseTrustProxy(raw: string | undefined): boolean | number | string {
  const value = raw?.trim();
  if (!value || value === "false") return false;
  if (value === "true") return true;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

/**
 * Reads settings from the environment. A pure function so tests can pass their own values.
 * Anything other than NODE_ENV=development or NODE_ENV=test (including no NODE_ENV at all) is treated
 * as production: no demo users and JWT_SECRET is required. Unsafe defaults must be opted into, never fallen into.
 */
export function loadEnv(raw: RawEnv = process.env) {
  const nodeEnv = raw.NODE_ENV || "production";
  const isProduction = nodeEnv !== "development" && nodeEnv !== "test";

  const jwtSecret = raw.JWT_SECRET || (isProduction ? undefined : DEV_ONLY_JWT_SECRET);
  if (!jwtSecret) throw new Error("JWT_SECRET must be set when NODE_ENV is not development or test");

  return {
    nodeEnv,
    isProduction,
    isTest: nodeEnv === "test",
    port: Number(raw.PORT ?? 4000),
    dbPath: raw.DB_PATH ?? "loan-tracker.db",
    jwtSecret,
    jwtExpiresIn: "1h",
    trustProxy: parseTrustProxy(raw.TRUST_PROXY),
    allowedOrigins: (raw.ALLOWED_ORIGINS ?? "http://localhost:3000")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  } as const;
}

export const env = loadEnv();
