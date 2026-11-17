import type { Express } from "express";
import request from "supertest";
import { createApp } from "../src/app";
import { createDb } from "../src/db/database";
import { AuthUser } from "../src/models/types";
import { DEMO_PASSWORD, DEMO_REVIEWER_EMAIL, seedDemoUsers } from "../src/seed";
import { createApplicationService } from "../src/services/applicationService";

const validApplication = {
  businessName: "Acme Bakery",
  principalPaise: 5_000_000, // ₹50,000
  tenureMonths: 12,
  monthlyRevenuePaise: 2_000_000, // ₹20,000
  yearsInBusiness: 4,
};

let app: Express;
let built: ReturnType<typeof createApp>;

beforeEach(() => {
  built = createApp(createDb(":memory:")); // fresh database for every test
  seedDemoUsers(built.repositories.users);
  app = built.app;
});

/** Runs fn and returns what it threw (fails the test if it didn't throw). */
function thrownBy(fn: () => unknown): { status?: number; message?: string } {
  try {
    fn();
  } catch (err) {
    return err as { status?: number; message?: string };
  }
  throw new Error("expected the call to throw");
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function registerMerchant(email: string): Promise<string> {
  const res = await request(app).post("/api/auth/register").send({ email, name: "Test Merchant", password: DEMO_PASSWORD });
  expect(res.status).toBe(201);
  return res.body.token;
}

async function loginReviewer(): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email: DEMO_REVIEWER_EMAIL, password: DEMO_PASSWORD });
  return res.body.token;
}

function apply(token: string, body: object = validApplication, idempotencyKey?: string) {
  const req = request(app).post("/api/applications").set(bearer(token));
  if (idempotencyKey) req.set("Idempotency-Key", idempotencyKey);
  return req.send(body);
}

describe("platform", () => {
  test("health check, security headers and request ids", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.headers["x-request-id"]).toBeTruthy();
    expect(res.headers["x-content-type-options"]).toBe("nosniff"); // set by helmet
  });

  test("CORS allows the frontend origin and blocks others", async () => {
    const allowed = await request(app).get("/health").set("Origin", "http://localhost:3000");
    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    const blocked = await request(app).get("/health").set("Origin", "https://evil.example");
    expect(blocked.headers["access-control-allow-origin"]).toBeUndefined();
  });

  test("unknown routes and malformed JSON return clean JSON errors", async () => {
    expect((await request(app).get("/api/nope")).status).toBe(404);
    const bad = await request(app).post("/api/auth/login").set("Content-Type", "application/json").send("{not json");
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe("Malformed JSON body");
  });

  test("a body that is not an object gets a 400 that says why (not empty details)", async () => {
    const token = await registerMerchant("a@test.com");
    const res = await request(app).post("/api/applications/quote").set(bearer(token)).send([1]);
    expect(res.status).toBe(400);
    expect(res.body.details.body).toEqual([expect.stringContaining("Expected object")]);
  });

  test("a valid X-Request-Id is reused; anything else is replaced with a fresh UUID", async () => {
    const uuid = "3f2b8c1e-9a4d-4e7b-b1c2-0d9e8f7a6b5c";
    expect((await request(app).get("/health").set("X-Request-Id", uuid)).headers["x-request-id"]).toBe(uuid);

    for (const bad of ["<script>alert(1)</script>", "a".repeat(65), "abc--def", "not a uuid"]) {
      const echoed = (await request(app).get("/health").set("X-Request-Id", bad)).headers["x-request-id"];
      expect(echoed).not.toBe(bad);
      expect(echoed).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    }
  });

  test("ids must be plain digits", async () => {
    const token = await registerMerchant("a@test.com");
    for (const id of ["1e2", "0x10", "1.0", "0", "-1"]) {
      expect((await request(app).get(`/api/applications/${id}`).set(bearer(token))).status).toBe(400);
    }
  });
});

describe("database constraints", () => {
  test("status columns only accept known statuses", () => {
    const db = createDb(":memory:");
    const merchant = db
      .prepare("INSERT INTO users (email, name, password_hash, role, created_at) VALUES ('m@t.com', 'M', 'x', 'merchant', 'now')")
      .run().lastInsertRowid;
    const insertApplication = (status: string) =>
      db
        .prepare(
          `INSERT INTO applications (merchant_id, business_name, principal_paise, tenure_months, monthly_revenue_paise,
             years_in_business, annual_rate_bps, emi_paise, status, created_at, updated_at)
           VALUES (?, 'Shop', 100, 12, 100, 1, 1200, 10, ?, 'now', 'now')`,
        )
        .run(merchant, status).lastInsertRowid;
    const insertEvent = (from: string | null, to: string) =>
      db
        .prepare("INSERT INTO application_events (application_id, from_status, to_status, actor_id, created_at) VALUES (?, ?, ?, ?, 'now')")
        .run(id, from, to, merchant);

    expect(() => insertApplication("PENDING")).toThrow(/CHECK constraint failed/);
    const id = insertApplication("SUBMITTED");
    expect(() => db.prepare("UPDATE applications SET status = 'approved' WHERE id = ?").run(id)).toThrow(/CHECK constraint failed/);
    expect(() => insertEvent(null, "SUBMITTED")).not.toThrow();
    expect(() => insertEvent("SUBMITTED", "DONE")).toThrow(/CHECK constraint failed/);
    expect(() => insertEvent("NOPE", "UNDER_REVIEW")).toThrow(/CHECK constraint failed/);
  });
});

describe("auth", () => {
  test("register, reject duplicate email, log in and read profile", async () => {
    const token = await registerMerchant("a@test.com");
    const dup = await request(app).post("/api/auth/register").send({ email: "A@test.com", name: "T", password: DEMO_PASSWORD });
    expect(dup.status).toBe(409); // emails are case-insensitive

    const login = await request(app).post("/api/auth/login").send({ email: "a@test.com", password: DEMO_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.user).toEqual({ id: expect.any(Number), email: "a@test.com", name: "Test Merchant", role: "merchant" });
    expect(login.body.user.passwordHash).toBeUndefined();

    const me = await request(app).get("/api/auth/me").set(bearer(token));
    expect(me.body.email).toBe("a@test.com");
  });

  test("wrong password, weak password, missing and forged tokens are rejected", async () => {
    await registerMerchant("a@test.com");
    expect((await request(app).post("/api/auth/login").send({ email: "a@test.com", password: "wrong-password" })).status).toBe(401);
    expect((await request(app).post("/api/auth/register").send({ email: "b@test.com", name: "B", password: "short" })).status).toBe(400);
    expect((await request(app).get("/api/applications")).status).toBe(401);
    expect((await request(app).get("/api/applications").set(bearer("not.a.jwt"))).status).toBe(401);
  });

  test("two simultaneous sign-ups with the same email: one 201, one 409 (never a 500)", async () => {
    const signUp = () => request(app).post("/api/auth/register").send({ email: "race@test.com", name: "R", password: DEMO_PASSWORD });
    const statuses = (await Promise.all([signUp(), signUp()])).map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409]);
  });
});

describe("loan applications", () => {
  test("quote shows rate, EMI and totals without creating anything", async () => {
    const token = await registerMerchant("a@test.com");
    const res = await request(app).post("/api/applications/quote").set(bearer(token)).send(validApplication);
    expect(res.body).toEqual({
      eligible: true,
      annualRateBps: 1200,
      emiPaise: 444_244,
      totalInterestPaise: 330_927,
      totalPayablePaise: 5_330_927,
    });
    expect((await request(app).get("/api/applications").set(bearer(token))).body.total).toBe(0);
  });

  test("creates an application with the computed rate and EMI", async () => {
    const token = await registerMerchant("a@test.com");
    const res = await apply(token);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "SUBMITTED", annualRateBps: 1200, emiPaise: 444_244, businessName: "Acme Bakery" });
  });

  test("ineligible applications get 422 with every reason", async () => {
    const token = await registerMerchant("a@test.com");
    const res = await apply(token, { ...validApplication, yearsInBusiness: 0, tenureMonths: 48 });
    expect(res.status).toBe(422);
    expect(res.body.details).toEqual([
      "Business must be at least 1 year old",
      "Tenure must be between 3 and 36 months",
    ]);
  });

  test("validates input and strips HTML from the business name", async () => {
    const token = await registerMerchant("a@test.com");
    const invalid = await apply(token, { ...validApplication, principalPaise: 10.5 });
    expect(invalid.status).toBe(400);
    expect(invalid.body.details.principalPaise).toBeDefined();
    const res = await apply(token, { ...validApplication, businessName: "<script>alert(1)</script>Shop" });
    expect(res.status).toBe(201);
    expect(res.body.businessName).not.toMatch(/[<>]/);
  });

  test("reviewers cannot apply", async () => {
    expect((await apply(await loginReviewer())).status).toBe(403);
  });

  test("a retried request with the same Idempotency-Key does not create a duplicate loan", async () => {
    const token = await registerMerchant("a@test.com");
    const first = await apply(token, validApplication, "retry-123");
    const retry = await apply(token, validApplication, "retry-123");
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.id).toBe(first.body.id);
    expect((await request(app).get("/api/applications").set(bearer(token))).body.total).toBe(1);

    const reused = await apply(token, { ...validApplication, principalPaise: 6_000_000 }, "retry-123");
    expect(reused.status).toBe(409); // same key, different request
  });

  test("merchants cannot see each other's applications (404, not 403)", async () => {
    const alice = await registerMerchant("alice@test.com");
    const bob = await registerMerchant("bob@test.com");
    const { body } = await apply(alice);
    expect((await request(app).get(`/api/applications/${body.id}`).set(bearer(bob))).status).toBe(404);
    expect((await request(app).get(`/api/applications/${body.id}/schedule`).set(bearer(bob))).status).toBe(404);
    expect((await request(app).get(`/api/applications/${body.id}/events`).set(bearer(bob))).status).toBe(404);
    const cancel = await request(app).post(`/api/applications/${body.id}/transition`).set(bearer(bob)).send({ to: "CANCELLED" });
    expect(cancel.status).toBe(404);
    expect((await request(app).get("/api/applications").set(bearer(bob))).body.total).toBe(0);
    expect((await request(app).get("/api/applications").set(bearer(await loginReviewer()))).body.total).toBe(1);
  });

  test("paginates newest first, filters by status and searches by name", async () => {
    const token = await registerMerchant("a@test.com");
    for (let i = 1; i <= 12; i++) await apply(token, { ...validApplication, businessName: `Shop ${i}` });

    const page1 = await request(app).get("/api/applications?page=1&limit=5").set(bearer(token));
    expect(page1.body.items[0].businessName).toBe("Shop 12");
    const page3 = await request(app).get("/api/applications?page=3&limit=5").set(bearer(token));
    expect(page3.body).toMatchObject({ page: 3, limit: 5, total: 12, totalPages: 3 });
    expect(page3.body.items).toHaveLength(2);

    expect((await request(app).get("/api/applications?status=APPROVED").set(bearer(token))).body.total).toBe(0);
    expect((await request(app).get("/api/applications?search=Shop%201").set(bearer(token))).body.total).toBe(4); // 1, 10, 11, 12
    expect((await request(app).get("/api/applications?search=%25").set(bearer(token))).body.total).toBe(0); // % is literal
    expect((await request(app).get("/api/applications?limit=500").set(bearer(token))).status).toBe(400);
  });

  test("full review lifecycle with role checks and an audit trail", async () => {
    const merchant = await registerMerchant("m@test.com");
    const reviewer = await loginReviewer();
    const { body: created } = await apply(merchant);
    const move = (token: string, to: string, note?: string) =>
      request(app).post(`/api/applications/${created.id}/transition`).set(bearer(token)).send({ to, note });

    expect((await move(merchant, "APPROVED")).status).toBe(403); // merchants can't approve
    expect((await move(reviewer, "APPROVED")).status).toBe(409); // must be reviewed first
    const review = await move(reviewer, "UNDER_REVIEW");
    expect(review.body).toMatchObject({ status: "UNDER_REVIEW", allowedActions: ["APPROVED", "REJECTED"] });
    expect((await move(merchant, "CANCELLED")).status).toBe(409); // too late to cancel
    expect((await move(reviewer, "APPROVED", "Strong revenue")).body.status).toBe("APPROVED");
    expect((await move(reviewer, "DISBURSED")).body).toMatchObject({ status: "DISBURSED", decisionNote: "Strong revenue" });
    expect((await move(reviewer, "REJECTED", "x")).status).toBe(409); // final state

    const events = await request(app).get(`/api/applications/${created.id}/events`).set(bearer(merchant));
    expect(events.body.map((e: { toStatus: string }) => e.toStatus)).toEqual([
      "SUBMITTED",
      "UNDER_REVIEW",
      "APPROVED",
      "DISBURSED",
    ]);
  });

  test("rejecting requires a reason; merchants can cancel before review", async () => {
    const merchant = await registerMerchant("m@test.com");
    const reviewer = await loginReviewer();
    const first = (await apply(merchant)).body;
    const second = (await apply(merchant)).body;
    const move = (token: string, id: number, to: string, note?: string) =>
      request(app).post(`/api/applications/${id}/transition`).set(bearer(token)).send({ to, note });

    expect((await move(merchant, second.id, "CANCELLED")).body.status).toBe("CANCELLED");
    await move(reviewer, first.id, "UNDER_REVIEW");
    expect((await move(reviewer, first.id, "REJECTED")).status).toBe(400);
    const rejected = await move(reviewer, first.id, "REJECTED", "Revenue could not be verified");
    expect(rejected.body).toMatchObject({ status: "REJECTED", decisionNote: "Revenue could not be verified" });
  });

  test("only an approve or reject note becomes the decision note; every note stays in the audit trail", async () => {
    const merchant = await registerMerchant("m@test.com");
    const reviewer = await loginReviewer();
    const { body: created } = await apply(merchant);
    const move = (to: string, note?: string) =>
      request(app).post(`/api/applications/${created.id}/transition`).set(bearer(reviewer)).send({ to, note });

    expect((await move("UNDER_REVIEW", "Checking bank statements")).body.decisionNote).toBeNull();
    expect((await move("APPROVED", "Strong revenue")).body.decisionNote).toBe("Strong revenue");
    expect((await move("DISBURSED", "Paid to account ending 1234")).body.decisionNote).toBe("Strong revenue");

    const events = await request(app).get(`/api/applications/${created.id}/events`).set(bearer(merchant));
    expect(events.body.map((e: { note: string | null }) => e.note)).toEqual([
      null,
      "Checking bank statements",
      "Strong revenue",
      "Paid to account ending 1234",
    ]);
  });

  test("returns the repayment schedule", async () => {
    const token = await registerMerchant("a@test.com");
    const { body } = await apply(token);
    const res = await request(app).get(`/api/applications/${body.id}/schedule`).set(bearer(token));
    expect(res.body).toHaveLength(12);
    expect(res.body[11].balancePaise).toBe(0);
  });

  test("summary is cached and the cache is cleared on writes", async () => {
    const token = await registerMerchant("a@test.com");
    const summary = () => request(app).get("/api/summary").set(bearer(token));
    expect((await summary()).headers["x-cache"]).toBe("MISS");
    expect((await summary()).headers["x-cache"]).toBe("HIT");
    await apply(token);
    const after = await summary();
    expect(after.headers["x-cache"]).toBe("MISS");
    expect(after.body).toEqual({ SUBMITTED: 1 });
  });
});

describe("concurrency", () => {
  // Each HTTP request runs synchronously in one Node process, so these races can't be produced with two
  // Supertest calls. Instead the service is given a repository that returns stale data, exactly what a
  // second API instance would see if another request committed in between its read and its write.

  test("a status change based on a stale read gets 409 and writes no audit event", async () => {
    const merchant = await registerMerchant("m@test.com");
    const { body: created } = await apply(merchant);
    const repo = built.repositories.applications;
    const staleSnapshot = repo.findById(created.id)!; // SUBMITTED

    const reviewerToken = await loginReviewer();
    await request(app).post(`/api/applications/${created.id}/transition`).set(bearer(reviewerToken)).send({ to: "UNDER_REVIEW" });

    const reviewer: AuthUser = { id: built.repositories.users.findByEmail(DEMO_REVIEWER_EMAIL)!.id, role: "reviewer" };
    const staleService = createApplicationService({ ...repo, findById: () => staleSnapshot });
    const err = thrownBy(() => staleService.transition(reviewer, created.id, "UNDER_REVIEW"));
    expect(err).toMatchObject({ status: 409, message: expect.stringContaining("just changed by someone else") });
    expect(repo.events(created.id).map((e) => e.toStatus)).toEqual(["SUBMITTED", "UNDER_REVIEW"]);
  });

  test("two racing creates with one Idempotency-Key: the loser gets the winner's loan, or 409 if its body differs", async () => {
    const token = await registerMerchant("m@test.com");
    const merchantId = (await request(app).get("/api/auth/me").set(bearer(token))).body.id;
    const winner = await apply(token, validApplication, "race-1");
    expect(winner.status).toBe(201);

    // The loser checked for the key before the winner's insert committed, so its first lookup finds nothing.
    const repo = built.repositories.applications;
    const racingService = () => {
      let lookups = 0;
      return createApplicationService({
        ...repo,
        findByIdempotencyKey: (id, key) => (lookups++ === 0 ? undefined : repo.findByIdempotencyKey(id, key)),
      });
    };
    const merchant: AuthUser = { id: merchantId, role: "merchant" };

    const replay = racingService().create(merchant, validApplication, "race-1");
    expect(replay).toEqual({ application: expect.objectContaining({ id: winner.body.id }), created: false });

    const different = { ...validApplication, principalPaise: 6_000_000 };
    expect(thrownBy(() => racingService().create(merchant, different, "race-1"))).toMatchObject({ status: 409 });
    expect((await request(app).get("/api/applications").set(bearer(token))).body.total).toBe(1);
  });
});
