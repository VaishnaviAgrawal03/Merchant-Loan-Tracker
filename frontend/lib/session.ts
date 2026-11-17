import { useSyncExternalStore } from "react";
import type { Session } from "./api";

/*
 * The JWT is kept in localStorage to keep this demo simple.
 * Trade-off: any XSS could read it. In production, prefer an httpOnly, Secure, SameSite cookie set by the API.
 */
const KEY = "loan-tracker-session";
const CHANGE_EVENT = "loan-tracker-session-change";

export function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session) {
  window.localStorage.setItem(KEY, JSON.stringify(session));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function clearSession() {
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange); // other tabs
  window.addEventListener(CHANGE_EVENT, onChange); // this tab
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

const getSnapshot = (): string | null => window.localStorage.getItem(KEY);
const getServerSnapshot = (): undefined => undefined; // unknown while prerendering on the server

/**
 * Returns the session, null when signed out, or undefined before the browser has been read.
 * useSyncExternalStore keeps every component in sync, including across browser tabs.
 */
export function useSession(): Session | null | undefined {
  const raw = useSyncExternalStore<string | null | undefined>(subscribe, getSnapshot, getServerSnapshot);
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}
