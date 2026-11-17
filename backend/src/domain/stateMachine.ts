import { Role, Status } from "../models/types";

/**
 * Allowed status changes:
 *   SUBMITTED -> UNDER_REVIEW -> APPROVED -> DISBURSED
 *   SUBMITTED -> CANCELLED          (merchant withdraws before review)
 *   UNDER_REVIEW -> REJECTED
 * REJECTED, CANCELLED and DISBURSED are final.
 */
const TRANSITIONS: Record<Status, readonly Status[]> = {
  SUBMITTED: ["UNDER_REVIEW", "CANCELLED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["DISBURSED"],
  REJECTED: [],
  CANCELLED: [],
  DISBURSED: [],
};

/** Which role may move an application INTO each status. */
const ALLOWED_ACTOR: Record<Status, Role> = {
  SUBMITTED: "merchant",
  CANCELLED: "merchant",
  UNDER_REVIEW: "reviewer",
  APPROVED: "reviewer",
  REJECTED: "reviewer",
  DISBURSED: "reviewer",
};

export type TransitionCheck = "ok" | "forbidden" | "invalid";

export function checkTransition(from: Status, to: Status, role: Role): TransitionCheck {
  if (ALLOWED_ACTOR[to] !== role) return "forbidden";
  return TRANSITIONS[from].includes(to) ? "ok" : "invalid";
}

export function nextStatuses(from: Status, role: Role): Status[] {
  return TRANSITIONS[from].filter((to) => ALLOWED_ACTOR[to] === role);
}

export const isFinal = (status: Status): boolean => TRANSITIONS[status].length === 0;

/** A decision is the reviewer's verdict. Only its note is stored as the application's decisionNote. */
export const isDecision = (status: Status): boolean => status === "APPROVED" || status === "REJECTED";
