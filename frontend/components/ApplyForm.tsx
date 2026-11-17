"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { api, errorMessages, formatRate, formatRupees, LoanRequest, Quote, toPaise } from "@/lib/api";

const EMPTY = { businessName: "", principal: "", tenure: "12", revenue: "", years: "" };
type Field = keyof typeof EMPTY;

function toLoanRequest(f: typeof EMPTY): LoanRequest | null {
  const request = {
    principalPaise: toPaise(f.principal),
    tenureMonths: Number(f.tenure),
    monthlyRevenuePaise: toPaise(f.revenue),
    yearsInBusiness: Number(f.years),
  };
  const complete = f.principal && f.tenure && f.revenue && f.years !== "";
  const valid = Object.values(request).every((n) => Number.isInteger(n) && n >= 0) && request.principalPaise > 0;
  return complete && valid ? request : null;
}

export default function ApplyForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState(EMPTY);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  // One key per logical submission: if the request is retried (double click, flaky network), the API returns the same loan.
  const idempotencyKey = useRef<string | null>(null);

  const loanRequest = toLoanRequest(form);
  const quoteInput = loanRequest ? JSON.stringify(loanRequest) : null;

  // Live quote: ask the API for rate and EMI 400 ms after the user stops typing.
  useEffect(() => {
    if (!quoteInput) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await api<Quote>("/applications/quote", { method: "POST", body: quoteInput });
        if (!cancelled) setQuote(result);
      } catch {
        if (!cancelled) setQuote(null);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [quoteInput]);

  const update = (field: Field) => (e: ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setForm((current) => ({ ...current, [field]: value }));
    idempotencyKey.current = null; // changed request = new submission
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors([]);
    if (!loanRequest || !form.businessName.trim()) {
      setErrors(["Fill in every field with a valid number."]);
      return;
    }
    idempotencyKey.current ??= crypto.randomUUID();
    setSubmitting(true);
    try {
      await api("/applications", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey.current },
        body: JSON.stringify({ ...loanRequest, businessName: form.businessName }),
      });
      idempotencyKey.current = null;
      setForm(EMPTY);
      setQuote(null);
      onCreated();
    } catch (err) {
      setErrors(errorMessages(err));
    } finally {
      setSubmitting(false);
    }
  }

  const visibleQuote = loanRequest ? quote : null;

  return (
    <form className="card" onSubmit={onSubmit} noValidate>
      <h2>Apply for a business loan</h2>
      <div className="grid">
        <label>
          Business name
          <input value={form.businessName} onChange={update("businessName")} maxLength={80} />
        </label>
        <label>
          Loan amount (₹)
          <input type="number" min="1" inputMode="decimal" value={form.principal} onChange={update("principal")} />
        </label>
        <label>
          Tenure (months)
          <input type="number" min="3" max="36" value={form.tenure} onChange={update("tenure")} />
        </label>
        <label>
          Monthly revenue (₹)
          <input type="number" min="1" inputMode="decimal" value={form.revenue} onChange={update("revenue")} />
        </label>
        <label>
          Years in business
          <input type="number" min="0" value={form.years} onChange={update("years")} />
        </label>
      </div>

      {visibleQuote?.eligible === true && (
        <div className="quote ok" aria-live="polite" data-testid="quote">
          <div className="stats">
            <div><span>Rate</span>{formatRate(visibleQuote.annualRateBps)} p.a.</div>
            <div><span>Monthly EMI</span>{formatRupees(visibleQuote.emiPaise)}</div>
            <div><span>Total interest</span>{formatRupees(visibleQuote.totalInterestPaise)}</div>
            <div><span>Total payable</span>{formatRupees(visibleQuote.totalPayablePaise)}</div>
          </div>
        </div>
      )}
      {visibleQuote?.eligible === false && (
        <div className="quote bad" aria-live="polite" data-testid="quote">
          Not eligible yet:
          <ul>
            {visibleQuote.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      <button className="primary" type="submit" disabled={submitting}>
        {submitting ? "Submitting…" : "Submit application"}
      </button>
      {errors.map((message) => (
        <p key={message} className="error" role="alert">
          {message}
        </p>
      ))}
    </form>
  );
}
