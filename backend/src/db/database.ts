import Database from "better-sqlite3";
import { STATUSES } from "../models/types";

export type Db = Database.Database;

// Built from the STATUSES constant so the database and the TypeScript type can never drift apart.
const STATUS_LIST = STATUSES.map((s) => `'${s}'`).join(", ");

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    NOT NULL UNIQUE,
    name          TEXT    NOT NULL,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL CHECK (role IN ('merchant', 'reviewer')),
    created_at    TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS applications (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    merchant_id           INTEGER NOT NULL REFERENCES users(id),
    business_name         TEXT    NOT NULL,
    principal_paise       INTEGER NOT NULL CHECK (principal_paise > 0),
    tenure_months         INTEGER NOT NULL CHECK (tenure_months > 0),
    monthly_revenue_paise INTEGER NOT NULL CHECK (monthly_revenue_paise > 0),
    years_in_business     INTEGER NOT NULL CHECK (years_in_business >= 0),
    annual_rate_bps       INTEGER NOT NULL CHECK (annual_rate_bps >= 0),
    emi_paise             INTEGER NOT NULL CHECK (emi_paise > 0),
    status                TEXT    NOT NULL CHECK (status IN (${STATUS_LIST})),
    decision_note         TEXT,
    idempotency_key       TEXT,
    created_at            TEXT    NOT NULL,
    updated_at            TEXT    NOT NULL,
    UNIQUE (merchant_id, idempotency_key)
  );

  CREATE TABLE IF NOT EXISTS application_events (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL REFERENCES applications(id),
    from_status    TEXT    CHECK (from_status IS NULL OR from_status IN (${STATUS_LIST})),
    to_status      TEXT    NOT NULL CHECK (to_status IN (${STATUS_LIST})),
    actor_id       INTEGER NOT NULL REFERENCES users(id),
    note           TEXT,
    created_at     TEXT    NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_applications_merchant ON applications (merchant_id, id DESC);
  CREATE INDEX IF NOT EXISTS idx_applications_status   ON applications (status, id DESC);
  CREATE INDEX IF NOT EXISTS idx_events_application    ON application_events (application_id, id);
`;

/** Opens (or creates) the database. Use ":memory:" for tests. */
export function createDb(path = ":memory:"): Db {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}
