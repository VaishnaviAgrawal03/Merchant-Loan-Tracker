import { clearSession, readSession } from "./session";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const STATUSES = ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "CANCELLED", "DISBURSED"] as const;
export type Status = (typeof STATUSES)[number];
export type Role = "merchant" | "reviewer";

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
}

export interface Session {
  token: string;
  user: User;
}

export interface Application {
  id: number;
  merchantId: number;
  businessName: string;
  principalPaise: number;
  tenureMonths: number;
  monthlyRevenuePaise: number;
  yearsInBusiness: number;
  annualRateBps: number;
  emiPaise: number;
  status: Status;
  decisionNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationDetail extends Application {
  allowedActions: Status[];
}

export interface ApplicationEvent {
  id: number;
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

export interface LoanRequest {
  principalPaise: number;
  tenureMonths: number;
  monthlyRevenuePaise: number;
  yearsInBusiness: number;
}

export type Quote =
  | { eligible: false; reasons: string[] }
  | { eligible: true; annualRateBps: number; emiPaise: number; totalInterestPaise: number; totalPayablePaise: number };

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }

  /** Flattens validation details ({ field: [messages] } or [reasons]) into readable lines. */
  get messages(): string[] {
    const lines = Array.isArray(this.details)
      ? this.details.map(String)
      : this.details && typeof this.details === "object"
        ? Object.entries(this.details).map(([field, msgs]) => `${field}: ${[msgs].flat().join(", ")}`)
        : [];
    return lines.length > 0 ? lines : [this.message]; // never show an empty error
  }
}

/** Typed fetch wrapper: adds the JWT, parses JSON and turns error responses into ApiError. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = readSession();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (session) headers.set("Authorization", `Bearer ${session.token}`);

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "Cannot reach the server. Is the backend running?");
  }

  const body = await res.json().catch(() => ({}));
  if (res.status === 401 && session) clearSession(); // expired or invalid token: sign out everywhere
  if (!res.ok) throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`, body.details);
  return body as T;
}

export const errorMessages = (err: unknown): string[] =>
  err instanceof ApiError ? err.messages : [err instanceof Error ? err.message : "Something went wrong"];

/** ₹ formatting with Indian digit grouping. Money travels as integer paise. */
export const formatRupees = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const toPaise = (rupees: string) => Math.round(Number(rupees) * 100);

export const formatRate = (bps: number) => `${(bps / 100).toFixed(2)}%`;

export const formatStatus = (status: Status) => status.replace("_", " ").toLowerCase();

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
