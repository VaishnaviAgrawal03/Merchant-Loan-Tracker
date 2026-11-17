export const ROLES = ["merchant", "reviewer"] as const;
export type Role = (typeof ROLES)[number];

export const STATUSES = ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "CANCELLED", "DISBURSED"] as const;
export type Status = (typeof STATUSES)[number];

/** The authenticated caller, taken from the JWT. */
export interface AuthUser {
  id: number;
  role: Role;
}

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  passwordHash: string;
  createdAt: string;
}

export type PublicUser = Omit<User, "passwordHash" | "createdAt">;

/** All money is stored as integer paise (1 rupee = 100 paise) to avoid floating-point errors. */
export interface Application {
  id: number;
  merchantId: number;
  businessName: string;
  principalPaise: number;
  tenureMonths: number;
  monthlyRevenuePaise: number;
  yearsInBusiness: number;
  /** Interest rate in basis points: 1200 = 12.00% per year. */
  annualRateBps: number;
  emiPaise: number;
  status: Status;
  decisionNote: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One row of the audit trail: every status change is recorded. */
export interface ApplicationEvent {
  id: number;
  applicationId: number;
  fromStatus: Status | null;
  toStatus: Status;
  actorId: number;
  note: string | null;
  createdAt: string;
}

export interface Installment {
  month: number;
  emiPaise: number;
  interestPaise: number;
  principalPaise: number;
  balancePaise: number;
}

export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
