"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api,
  ApplicationDetail,
  ApplicationEvent,
  errorMessages,
  formatDate,
  formatRate,
  formatRupees,
  formatStatus,
  Installment,
  Status,
} from "@/lib/api";
import StatusBadge from "./StatusBadge";

const ACTION_LABELS: Record<Status, string> = {
  SUBMITTED: "Submit",
  UNDER_REVIEW: "Start review",
  APPROVED: "Approve",
  REJECTED: "Reject",
  CANCELLED: "Cancel application",
  DISBURSED: "Disburse",
};

interface Loaded {
  application: ApplicationDetail;
  schedule: Installment[];
  events: ApplicationEvent[];
}

/** Loaded lazily (next/dynamic) only when a row is opened, so the dashboard's first load stays small. */
export default function ApplicationDetails({ id, onChanged, onClose }: { id: number; onChanged: () => void; onClose: () => void }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const fetchAll = useCallback(async (): Promise<Loaded> => {
    const [application, schedule, events] = await Promise.all([
      api<ApplicationDetail>(`/applications/${id}`),
      api<Installment[]>(`/applications/${id}/schedule`),
      api<ApplicationEvent[]>(`/applications/${id}/events`),
    ]);
    return { application, schedule, events };
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    fetchAll()
      .then((loaded) => !cancelled && setData(loaded))
      .catch((err) => !cancelled && setErrors(errorMessages(err)));
    return () => {
      cancelled = true;
    };
  }, [fetchAll]);

  async function move(to: Status) {
    setErrors([]);
    setBusy(true);
    try {
      await api(`/applications/${id}/transition`, { method: "POST", body: JSON.stringify({ to, note: note || undefined }) });
      setNote("");
      setData(await fetchAll());
      onChanged();
    } catch (err) {
      setErrors(errorMessages(err));
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <section className="card" aria-label="Application details">
        {errors.length ? errors.map((m) => <p key={m} className="error">{m}</p>) : <p className="muted">Loading application…</p>}
      </section>
    );
  }

  const { application: a, schedule, events } = data;
  const needsNote = a.allowedActions.includes("REJECTED");

  return (
    <section className="card" aria-label="Application details">
      <div className="topbar" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>
          #{a.id} · {a.businessName} <StatusBadge status={a.status} />
        </h2>
        <button type="button" onClick={onClose}>Close</button>
      </div>

      <div className="details-grid">
        <div><span>Amount</span>{formatRupees(a.principalPaise)}</div>
        <div><span>Tenure</span>{a.tenureMonths} months</div>
        <div><span>Rate</span>{formatRate(a.annualRateBps)}</div>
        <div><span>EMI</span>{formatRupees(a.emiPaise)}</div>
        <div><span>Monthly revenue</span>{formatRupees(a.monthlyRevenuePaise)}</div>
        <div><span>Years in business</span>{a.yearsInBusiness}</div>
      </div>
      {a.decisionNote && <p className="muted">Decision note: {a.decisionNote}</p>}

      {a.allowedActions.length > 0 && (
        <>
          <h3>Actions</h3>
          {needsNote && (
            <label>
              Note (required to reject)
              <textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          )}
          <div className="actions">
            {a.allowedActions.map((to) => (
              <button
                key={to}
                type="button"
                className={to === "REJECTED" || to === "CANCELLED" ? "danger" : "primary"}
                disabled={busy}
                onClick={() => move(to)}
              >
                {ACTION_LABELS[to]}
              </button>
            ))}
          </div>
        </>
      )}
      {errors.map((message) => (
        <p key={message} className="error" role="alert">{message}</p>
      ))}

      <h3>History</h3>
      <ol className="timeline">
        {events.map((e) => (
          <li key={e.id}>
            {e.fromStatus ? `${formatStatus(e.fromStatus)} → ` : ""}
            <strong>{formatStatus(e.toStatus)}</strong> <span className="muted">· {formatDate(e.createdAt)}</span>
            {e.note && <span className="muted"> · “{e.note}”</span>}
          </li>
        ))}
      </ol>

      <h3>Repayment schedule</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th className="num">EMI</th>
              <th className="num">Interest</th>
              <th className="num">Principal</th>
              <th className="num">Balance</th>
            </tr>
          </thead>
          <tbody>
            {schedule.map((row) => (
              <tr key={row.month}>
                <td>{row.month}</td>
                <td className="num">{formatRupees(row.emiPaise)}</td>
                <td className="num">{formatRupees(row.interestPaise)}</td>
                <td className="num">{formatRupees(row.principalPaise)}</td>
                <td className="num">{formatRupees(row.balancePaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
