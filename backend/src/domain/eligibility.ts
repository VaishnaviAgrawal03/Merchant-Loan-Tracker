export interface LoanRequest {
  principalPaise: number;
  tenureMonths: number;
  monthlyRevenuePaise: number;
  yearsInBusiness: number;
}

export type Decision = { eligible: true; annualRateBps: number } | { eligible: false; reasons: string[] };

export const BASE_RATE_BPS = 1200; // 12% per year
export const MIN_TENURE_MONTHS = 3;
export const MAX_TENURE_MONTHS = 36;
export const MAX_REVENUE_MULTIPLE = 6;

/**
 * Rules engine: a pure function, so it is easy to test and has no side effects.
 * It returns every failing rule (not just the first) so the merchant can fix them all at once,
 * and prices eligible loans with risk-based add-ons to the base rate.
 */
export function assess(input: LoanRequest): Decision {
  const reasons: string[] = [];

  if (input.yearsInBusiness < 1) {
    reasons.push("Business must be at least 1 year old");
  }
  if (input.principalPaise > input.monthlyRevenuePaise * MAX_REVENUE_MULTIPLE) {
    reasons.push(`Loan amount cannot exceed ${MAX_REVENUE_MULTIPLE}x monthly revenue`);
  }
  if (input.tenureMonths < MIN_TENURE_MONTHS || input.tenureMonths > MAX_TENURE_MONTHS) {
    reasons.push(`Tenure must be between ${MIN_TENURE_MONTHS} and ${MAX_TENURE_MONTHS} months`);
  }
  if (reasons.length > 0) return { eligible: false, reasons };

  let rate = BASE_RATE_BPS;
  if (input.yearsInBusiness < 3) rate += 200; // younger business
  if (input.principalPaise > input.monthlyRevenuePaise * 3) rate += 150; // high loan-to-revenue
  if (input.tenureMonths > 24) rate += 100; // longer exposure
  return { eligible: true, annualRateBps: rate };
}
