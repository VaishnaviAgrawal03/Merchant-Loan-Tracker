import { Db } from "../db/database";
import { Application, ApplicationEvent, Status } from "../models/types";

interface ApplicationRow {
  id: number;
  merchant_id: number;
  business_name: string;
  principal_paise: number;
  tenure_months: number;
  monthly_revenue_paise: number;
  years_in_business: number;
  annual_rate_bps: number;
  emi_paise: number;
  status: Status;
  decision_note: string | null;
  created_at: string;
  updated_at: string;
}

interface EventRow {
  id: number;
  application_id: number;
  from_status: Status | null;
  to_status: Status;
  actor_id: number;
  note: string | null;
  created_at: string;
}

export interface NewApplication {
  merchantId: number;
  businessName: string;
  principalPaise: number;
  tenureMonths: number;
  monthlyRevenuePaise: number;
  yearsInBusiness: number;
  annualRateBps: number;
  emiPaise: number;
  idempotencyKey?: string;
}

export interface StatusChange {
  id: number;
  /** The status the caller last saw. The update only applies if it is still this. */
  from: Status;
  to: Status;
  actorId: number;
  note: string | null;
  recordDecision: boolean;
}

export interface ListFilter {
  merchantId?: number;
  status?: Status;
  search?: string;
  limit: number;
  offset: number;
}

const toApplication = (r: ApplicationRow): Application => ({
  id: r.id,
  merchantId: r.merchant_id,
  businessName: r.business_name,
  principalPaise: r.principal_paise,
  tenureMonths: r.tenure_months,
  monthlyRevenuePaise: r.monthly_revenue_paise,
  yearsInBusiness: r.years_in_business,
  annualRateBps: r.annual_rate_bps,
  emiPaise: r.emi_paise,
  status: r.status,
  decisionNote: r.decision_note,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toEvent = (r: EventRow): ApplicationEvent => ({
  id: r.id,
  applicationId: r.application_id,
  fromStatus: r.from_status,
  toStatus: r.to_status,
  actorId: r.actor_id,
  note: r.note,
  createdAt: r.created_at,
});

/** All SQL for applications and their audit trail lives here. */
export function createApplicationRepository(db: Db) {
  const byId = db.prepare<[number], ApplicationRow>("SELECT * FROM applications WHERE id = ?");
  const byIdempotencyKey = db.prepare<[number, string], ApplicationRow>(
    "SELECT * FROM applications WHERE merchant_id = ? AND idempotency_key = ?",
  );
  const insertApplication = db.prepare(`
    INSERT INTO applications (
      merchant_id, business_name, principal_paise, tenure_months, monthly_revenue_paise,
      years_in_business, annual_rate_bps, emi_paise, status, idempotency_key, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', ?, ?, ?)
  `);
  // Compare-and-swap: only updates if the status is still what the caller last saw.
  const compareAndSetStatus = db.prepare(`
    UPDATE applications
       SET status = ?, updated_at = ?
     WHERE id = ? AND status = ?
  `);
  // Same, but also records the reviewer's decision note (APPROVED / REJECTED).
  const compareAndSetStatusWithDecision = db.prepare(`
    UPDATE applications
       SET status = ?, updated_at = ?, decision_note = ?
     WHERE id = ? AND status = ?
  `);
  const insertEvent = db.prepare(`
    INSERT INTO application_events (application_id, from_status, to_status, actor_id, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const eventsFor = db.prepare<[number], EventRow>(
    "SELECT * FROM application_events WHERE application_id = ? ORDER BY id",
  );

  /** Insert the application and its first audit event atomically. */
  const create = db.transaction((a: NewApplication): Application => {
    const now = new Date().toISOString();
    const info = insertApplication.run(
      a.merchantId,
      a.businessName,
      a.principalPaise,
      a.tenureMonths,
      a.monthlyRevenuePaise,
      a.yearsInBusiness,
      a.annualRateBps,
      a.emiPaise,
      a.idempotencyKey ?? null,
      now,
      now,
    );
    const id = Number(info.lastInsertRowid);
    insertEvent.run(id, null, "SUBMITTED", a.merchantId, null, now);
    return toApplication(byId.get(id)!);
  });

  /**
   * Change status and write the audit event in one transaction. Returns false if someone else changed it first.
   * The note always goes on the audit event; it also becomes decision_note only when recordDecision is true.
   */
  const transition = db.transaction((t: StatusChange): boolean => {
    const now = new Date().toISOString();
    const result = t.recordDecision
      ? compareAndSetStatusWithDecision.run(t.to, now, t.note, t.id, t.from)
      : compareAndSetStatus.run(t.to, now, t.id, t.from);
    const changed = result.changes === 1;
    if (changed) insertEvent.run(t.id, t.from, t.to, t.actorId, t.note, now);
    return changed;
  });

  return {
    create,
    transition,

    findById(id: number): Application | undefined {
      const row = byId.get(id);
      return row ? toApplication(row) : undefined;
    },

    findByIdempotencyKey(merchantId: number, key: string): Application | undefined {
      const row = byIdempotencyKey.get(merchantId, key);
      return row ? toApplication(row) : undefined;
    },

    list(filter: ListFilter): { items: Application[]; total: number } {
      const conditions: string[] = [];
      const params: (string | number)[] = [];
      if (filter.merchantId !== undefined) {
        conditions.push("merchant_id = ?");
        params.push(filter.merchantId);
      }
      if (filter.status) {
        conditions.push("status = ?");
        params.push(filter.status);
      }
      if (filter.search) {
        conditions.push("business_name LIKE ? ESCAPE '\\'");
        params.push(`%${filter.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
      }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const { total } = db
        .prepare<(string | number)[], { total: number }>(`SELECT COUNT(*) AS total FROM applications ${where}`)
        .get(...params)!;
      const rows = db
        .prepare<(string | number)[], ApplicationRow>(
          `SELECT * FROM applications ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
        )
        .all(...params, filter.limit, filter.offset);

      return { items: rows.map(toApplication), total };
    },

    events(applicationId: number): ApplicationEvent[] {
      return eventsFor.all(applicationId).map(toEvent);
    },

    countByStatus(merchantId?: number): Partial<Record<Status, number>> {
      const rows =
        merchantId === undefined
          ? db
              .prepare<[], { status: Status; n: number }>("SELECT status, COUNT(*) AS n FROM applications GROUP BY status")
              .all()
          : db
              .prepare<[number], { status: Status; n: number }>(
                "SELECT status, COUNT(*) AS n FROM applications WHERE merchant_id = ? GROUP BY status",
              )
              .all(merchantId);
      return Object.fromEntries(rows.map((r) => [r.status, r.n]));
    },
  };
}

export type ApplicationRepository = ReturnType<typeof createApplicationRepository>;
