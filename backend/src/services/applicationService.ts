import { assess, LoanRequest } from "../domain/eligibility";
import { buildSchedule, calculateEmi } from "../domain/emi";
import { checkTransition, isDecision, nextStatuses } from "../domain/stateMachine";
import { Application, AuthUser, Page, Status } from "../models/types";
import { ApplicationRepository } from "../repositories/applicationRepository";
import { AppError } from "../utils/AppError";
import { isUniqueViolation } from "../utils/dbErrors";
import { TtlCache } from "../utils/ttlCache";

export interface LoanInput extends LoanRequest {
  businessName: string;
}

export interface ListQuery {
  page: number;
  limit: number;
  status?: Status;
  search?: string;
}

export type Quote =
  | { eligible: false; reasons: string[] }
  | { eligible: true; annualRateBps: number; emiPaise: number; totalInterestPaise: number; totalPayablePaise: number };

const SUMMARY_TTL_MS = 10_000;

const sameRequest = (existing: Application, input: LoanInput) =>
  existing.businessName === input.businessName &&
  existing.principalPaise === input.principalPaise &&
  existing.tenureMonths === input.tenureMonths &&
  existing.monthlyRevenuePaise === input.monthlyRevenuePaise &&
  existing.yearsInBusiness === input.yearsInBusiness;

export function createApplicationService(applications: ApplicationRepository) {
  const summaryCache = new TtlCache<Partial<Record<Status, number>>>(SUMMARY_TTL_MS);

  /** Merchants only see their own applications. Others get 404 (not 403) so ids can't be probed. */
  function getVisible(actor: AuthUser, id: number): Application {
    const application = applications.findById(id);
    if (!application || (actor.role === "merchant" && application.merchantId !== actor.id)) {
      throw new AppError(404, "Application not found");
    }
    return application;
  }

  function quote(input: LoanRequest): Quote {
    const decision = assess(input);
    if (!decision.eligible) return decision;
    const schedule = buildSchedule(input.principalPaise, decision.annualRateBps, input.tenureMonths);
    const totalInterestPaise = schedule.reduce((sum, row) => sum + row.interestPaise, 0);
    return {
      eligible: true,
      annualRateBps: decision.annualRateBps,
      emiPaise: calculateEmi(input.principalPaise, decision.annualRateBps, input.tenureMonths),
      totalInterestPaise,
      totalPayablePaise: input.principalPaise + totalInterestPaise,
    };
  }

  function create(actor: AuthUser, input: LoanInput, idempotencyKey?: string): { application: Application; created: boolean } {
    if (actor.role !== "merchant") throw new AppError(403, "Only merchants can apply for loans");

    // A retried request with the same Idempotency-Key returns the original result instead of a duplicate loan.
    const replay = () => {
      const existing = idempotencyKey ? applications.findByIdempotencyKey(actor.id, idempotencyKey) : undefined;
      if (existing && !sameRequest(existing, input)) {
        throw new AppError(409, "Idempotency-Key was already used for a different request");
      }
      return existing;
    };
    const existing = replay();
    if (existing) return { application: existing, created: false };

    const decision = assess(input);
    if (!decision.eligible) throw new AppError(422, "Application is not eligible", decision.reasons);

    try {
      const application = applications.create({
        ...input,
        merchantId: actor.id,
        annualRateBps: decision.annualRateBps,
        emiPaise: calculateEmi(input.principalPaise, decision.annualRateBps, input.tenureMonths),
        idempotencyKey,
      });
      summaryCache.clear();
      return { application, created: true };
    } catch (err) {
      // Two identical requests raced: the database's UNIQUE constraint caught it, so return the winner.
      const winner = isUniqueViolation(err) ? replay() : undefined;
      if (winner) return { application: winner, created: false };
      throw err;
    }
  }

  function list(actor: AuthUser, query: ListQuery): Page<Application> {
    const { items, total } = applications.list({
      merchantId: actor.role === "merchant" ? actor.id : undefined,
      status: query.status,
      search: query.search,
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    });
    return {
      items,
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  function get(actor: AuthUser, id: number) {
    const application = getVisible(actor, id);
    return { ...application, allowedActions: nextStatuses(application.status, actor.role) };
  }

  function schedule(actor: AuthUser, id: number) {
    const application = getVisible(actor, id);
    return buildSchedule(application.principalPaise, application.annualRateBps, application.tenureMonths);
  }

  function events(actor: AuthUser, id: number) {
    getVisible(actor, id);
    return applications.events(id);
  }

  function transition(actor: AuthUser, id: number, to: Status, note?: string) {
    const application = getVisible(actor, id);
    const check = checkTransition(application.status, to, actor.role);
    if (check === "forbidden") throw new AppError(403, `A ${actor.role} cannot move an application to ${to}`);
    if (check === "invalid") throw new AppError(409, `Cannot move an application from ${application.status} to ${to}`);
    if (to === "REJECTED" && !note) throw new AppError(400, "A reason is required to reject an application");

    const changed = applications.transition({
      id,
      from: application.status,
      to,
      actorId: actor.id,
      note: note ?? null,
      recordDecision: isDecision(to), // only APPROVED / REJECTED notes become the application's decision note
    });
    if (!changed) {
      throw new AppError(409, "This application was just changed by someone else. Refresh and try again.");
    }
    summaryCache.clear();
    return get(actor, id);
  }

  function summary(actor: AuthUser): { counts: Partial<Record<Status, number>>; cached: boolean } {
    const key = actor.role === "merchant" ? `merchant:${actor.id}` : "all";
    const hit = summaryCache.get(key);
    if (hit) return { counts: hit, cached: true };
    const counts = applications.countByStatus(actor.role === "merchant" ? actor.id : undefined);
    summaryCache.set(key, counts);
    return { counts, cached: false };
  }

  return { quote, create, list, get, schedule, events, transition, summary };
}

export type ApplicationService = ReturnType<typeof createApplicationService>;
