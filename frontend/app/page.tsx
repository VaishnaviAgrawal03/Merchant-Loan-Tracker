"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorMessages, Session } from "@/lib/api";
import { saveSession, useSession } from "@/lib/session";

type Mode = "login" | "register";

export default function AuthPage() {
  const router = useRouter();
  const session = useSession();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (session) router.replace("/dashboard");
  }, [session, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors([]);
    setSubmitting(true);
    try {
      const body = mode === "login" ? { email, password } : { name, email, password };
      saveSession(await api<Session>(`/auth/${mode}`, { method: "POST", body: JSON.stringify(body) }));
    } catch (err) {
      setErrors(errorMessages(err));
    } finally {
      setSubmitting(false);
    }
  }

  function switchMode() {
    setMode(mode === "login" ? "register" : "login");
    setErrors([]);
  }

  return (
    <main>
      <div className="card auth-card">
        <h1>Merchant Loan Tracker</h1>
        <p className="muted">{mode === "login" ? "Sign in to continue." : "Create a merchant account to apply for a loan."}</p>

        <form onSubmit={onSubmit} noValidate>
          {mode === "register" && (
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
            </label>
          )}
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
            />
          </label>
          <div className="actions">
            <button className="primary" type="submit" disabled={submitting}>
              {mode === "login" ? "Log in" : "Create account"}
            </button>
            <button type="button" className="link" onClick={switchMode}>
              {mode === "login" ? "New merchant? Create an account" : "Already registered? Log in"}
            </button>
          </div>
          {errors.map((message) => (
            <p key={message} className="error" role="alert">
              {message}
            </p>
          ))}
        </form>

        <p className="muted" style={{ marginTop: 16 }}>
          Demo accounts (password <code>Passw0rd!</code>): reviewer@demo.com, merchant@demo.com
        </p>
      </div>
    </main>
  );
}
