import { loadEnv, parseTrustProxy } from "../src/config/env";
import { assess } from "../src/domain/eligibility";
import { buildSchedule, calculateEmi } from "../src/domain/emi";
import { checkTransition, isDecision, isFinal, nextStatuses } from "../src/domain/stateMachine";
import { Status } from "../src/models/types";
import { TtlCache } from "../src/utils/ttlCache";

describe("EMI calculation", () => {
  test("matches the standard formula: ₹1,00,000 at 12% for 12 months = ₹8,884.88", () => {
    expect(calculateEmi(10_000_000, 1200, 12)).toBe(888_488);
  });

  test("a zero-interest loan is split evenly", () => {
    expect(calculateEmi(1_200_000, 0, 12)).toBe(100_000);
  });

  test("the schedule repays exactly the principal and ends at zero", () => {
    const rows = buildSchedule(10_000_000, 1200, 12);
    expect(rows).toHaveLength(12);
    expect(rows[0]).toMatchObject({ interestPaise: 100_000, principalPaise: 788_488 }); // 1% of ₹1,00,000 in month 1
    expect(rows.reduce((sum, r) => sum + r.principalPaise, 0)).toBe(10_000_000);
    expect(rows[11].balancePaise).toBe(0);
  });

  test("interest falls every month as the balance reduces", () => {
    const rows = buildSchedule(10_000_000, 1800, 24);
    for (let i = 1; i < rows.length; i++) expect(rows[i].interestPaise).toBeLessThan(rows[i - 1].interestPaise);
  });
});

describe("eligibility rules", () => {
  const healthy = { principalPaise: 5_000_000, tenureMonths: 12, monthlyRevenuePaise: 2_000_000, yearsInBusiness: 4 };

  test("a healthy business gets the 12% base rate", () => {
    expect(assess(healthy)).toEqual({ eligible: true, annualRateBps: 1200 });
  });

  test("every failing rule is reported, not just the first", () => {
    const decision = assess({ ...healthy, yearsInBusiness: 0, principalPaise: 50_000_000, tenureMonths: 60 });
    expect(decision.eligible).toBe(false);
    if (!decision.eligible) expect(decision.reasons).toHaveLength(3);
  });

  test("riskier profiles pay more", () => {
    const decision = assess({ ...healthy, yearsInBusiness: 2, principalPaise: 7_000_000, tenureMonths: 30 });
    expect(decision).toEqual({ eligible: true, annualRateBps: 1200 + 200 + 150 + 100 });
  });

  test("boundaries are inclusive: exactly 6x revenue and 36 months are allowed", () => {
    expect(assess({ ...healthy, principalPaise: 12_000_000, tenureMonths: 36 }).eligible).toBe(true);
    expect(assess({ ...healthy, principalPaise: 12_000_001 }).eligible).toBe(false);
  });
});

describe("status state machine", () => {
  test("allows the happy path", () => {
    expect(checkTransition("SUBMITTED", "UNDER_REVIEW", "reviewer")).toBe("ok");
    expect(checkTransition("UNDER_REVIEW", "APPROVED", "reviewer")).toBe("ok");
    expect(checkTransition("APPROVED", "DISBURSED", "reviewer")).toBe("ok");
  });

  test("blocks skipping steps", () => {
    expect(checkTransition("SUBMITTED", "APPROVED", "reviewer")).toBe("invalid");
  });

  test("merchants cannot approve their own loans", () => {
    expect(checkTransition("UNDER_REVIEW", "APPROVED", "merchant")).toBe("forbidden");
  });

  test("merchants can cancel only before review starts", () => {
    expect(checkTransition("SUBMITTED", "CANCELLED", "merchant")).toBe("ok");
    expect(checkTransition("UNDER_REVIEW", "CANCELLED", "merchant")).toBe("invalid");
  });

  test("final states have no way out", () => {
    expect(isFinal("REJECTED")).toBe(true);
    expect(isFinal("DISBURSED")).toBe(true);
    expect(nextStatuses("UNDER_REVIEW", "reviewer")).toEqual(["APPROVED", "REJECTED"]);
    expect(nextStatuses("UNDER_REVIEW", "merchant")).toEqual([]);
  });

  test("only approving or rejecting counts as a decision", () => {
    expect(isDecision("APPROVED")).toBe(true);
    expect(isDecision("REJECTED")).toBe(true);
    const others: Status[] = ["SUBMITTED", "UNDER_REVIEW", "CANCELLED", "DISBURSED"];
    expect(others.filter(isDecision)).toEqual([]);
  });
});

describe("TTL cache", () => {
  test("entries expire after the TTL and clear() empties it", () => {
    let now = 0;
    const cache = new TtlCache<number>(1000, () => now);
    cache.set("a", 1);
    expect(cache.get("a")).toBe(1);
    now = 1000;
    expect(cache.get("a")).toBeUndefined();
    cache.set("b", 2);
    cache.clear();
    expect(cache.get("b")).toBeUndefined();
  });
});

describe("environment config", () => {
  test("a missing NODE_ENV means production: JWT_SECRET is required", () => {
    expect(() => loadEnv({})).toThrow("JWT_SECRET must be set");
    expect(loadEnv({ JWT_SECRET: "s3cret" })).toMatchObject({ nodeEnv: "production", isProduction: true, jwtSecret: "s3cret" });
  });

  test("any NODE_ENV other than development or test is treated as production", () => {
    expect(() => loadEnv({ NODE_ENV: "staging" })).toThrow("JWT_SECRET must be set");
    expect(loadEnv({ NODE_ENV: "staging", JWT_SECRET: "s3cret" }).isProduction).toBe(true);
  });

  test("development and test may use the dev-only secret", () => {
    expect(loadEnv({ NODE_ENV: "development" })).toMatchObject({ isProduction: false, isTest: false });
    expect(loadEnv({ NODE_ENV: "test" })).toMatchObject({ isProduction: false, isTest: true });
    expect(loadEnv({ NODE_ENV: "development" }).jwtSecret).toBeTruthy();
  });

  test("TRUST_PROXY accepts booleans, hop counts and address lists", () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy("")).toBe(false);
    expect(parseTrustProxy("false")).toBe(false);
    expect(parseTrustProxy("true")).toBe(true);
    expect(parseTrustProxy("1")).toBe(1);
    expect(parseTrustProxy(" loopback, 10.0.0.0/8 ")).toBe("loopback, 10.0.0.0/8");
    expect(loadEnv({ NODE_ENV: "test", TRUST_PROXY: "2" }).trustProxy).toBe(2);
  });
});
