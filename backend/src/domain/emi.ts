import { Installment } from "../models/types";

/**
 * Monthly installment (EMI) of a reducing-balance loan, in paise.
 * EMI = P * r * (1 + r)^n / ((1 + r)^n - 1), where r is the monthly rate.
 */
export function calculateEmi(principalPaise: number, annualRateBps: number, months: number): number {
  const r = annualRateBps / 10_000 / 12;
  if (r === 0) return Math.round(principalPaise / months);
  const growth = Math.pow(1 + r, months);
  return Math.round((principalPaise * r * growth) / (growth - 1));
}

/**
 * Month-by-month repayment table. Each month's interest is charged on the remaining balance.
 * The last installment absorbs rounding, so the balance always ends at exactly 0.
 */
export function buildSchedule(principalPaise: number, annualRateBps: number, months: number): Installment[] {
  const r = annualRateBps / 10_000 / 12;
  const emi = calculateEmi(principalPaise, annualRateBps, months);
  const rows: Installment[] = [];
  let balance = principalPaise;

  for (let month = 1; month <= months; month++) {
    const interest = Math.round(balance * r);
    const principalPart = month === months ? balance : Math.min(balance, emi - interest);
    balance -= principalPart;
    rows.push({
      month,
      emiPaise: principalPart + interest,
      interestPaise: interest,
      principalPaise: principalPart,
      balancePaise: balance,
    });
  }
  return rows;
}
