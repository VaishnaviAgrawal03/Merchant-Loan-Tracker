"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import ApplyForm from "@/components/ApplyForm";
import StatusBadge from "@/components/StatusBadge";
import {
  api,
  Application,
  errorMessages,
  formatDate,
  formatRate,
  formatRupees,
  formatStatus,
  Page,
  Status,
  STATUSES,
} from "@/lib/api";
import { clearSession, useSession } from "@/lib/session";

// Code splitting + lazy loading: this component's JavaScript is only downloaded when a row is opened.
const ApplicationDetails = dynamic(() => import("@/components/ApplicationDetails"), {
  loading: () => <section className="card"><p className="muted">Loading details…</p></section>,
});

const PAGE_SIZE = 5;

export default function DashboardPage() {
  const router = useRouter();
  const session = useSession();

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"" | Status>("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [version, setVersion] = useState(0); // bump to refetch after a change
  const [list, setList] = useState<Page<Application> | null>(null);
  const [summary, setSummary] = useState<Partial<Record<Status, number>>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const token = session?.token;
  const role = session?.user.role;

  useEffect(() => {
    if (session === null) router.replace("/");
  }, [session, router]);

  // Debounce the search box so we don't call the API on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (status) params.set("status", status);
    if (search) params.set("search", search);

    Promise.all([api<Page<Application>>(`/applications?${params}`), api<Partial<Record<Status, number>>>("/summary")])
      .then(([applications, counts]) => {
        if (cancelled) return;
        setList(applications);
        setSummary(counts);
        setErrors([]);
      })
      .catch((err) => !cancelled && setErrors(errorMessages(err)));
    return () => {
      cancelled = true;
    };
  }, [token, page, status, search, version]);

  const refresh = () => setVersion((v) => v + 1);

  if (!session) return <main><p className="muted">Loading…</p></main>;

  const total = Object.values(summary).reduce((a, b) => a + (b ?? 0), 0);

  return (
    <main>
      <header className="topbar">
        <div>
          <h1>Merchant Loan Tracker</h1>
          <p className="muted">
            Signed in as {session.user.name} ({role})
          </p>
        </div>
        <button type="button" onClick={() => clearSession()}>
          Log out
        </button>
      </header>

      <div className="chips" aria-label="Summary">
        <span className="chip">All<strong>{total}</strong></span>
        {STATUSES.map((s) => (
          <span key={s} className="chip">
            <span style={{ textTransform: "capitalize" }}>{formatStatus(s)}</span>
            <strong>{summary[s] ?? 0}</strong>
          </span>
        ))}
      </div>

      {role === "merchant" && (
        <ApplyForm
          onCreated={() => {
            setPage(1);
            refresh();
          }}
        />
      )}

      <section className="card">
        <h2>{role === "reviewer" ? "All applications" : "Your applications"}</h2>
        <div className="toolbar">
          <label>
            Search business
            <input
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setPage(1);
              }}
              placeholder="e.g. Bakery"
            />
          </label>
          <label>
            Status
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as "" | Status);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {formatStatus(s)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {errors.map((message) => (
          <p key={message} className="error" role="alert">{message}</p>
        ))}

        {list && list.items.length === 0 && <p className="muted">No applications found.</p>}
        {list && list.items.length > 0 && (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Business</th>
                    <th className="num">Amount</th>
                    <th className="num">Tenure</th>
                    <th className="num">Rate</th>
                    <th className="num">EMI</th>
                    <th>Status</th>
                    <th>Updated</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.items.map((a) => (
                    <tr key={a.id} className={a.id === selectedId ? "selected" : undefined}>
                      <td>#{a.id}</td>
                      <td>{a.businessName}</td>
                      <td className="num">{formatRupees(a.principalPaise)}</td>
                      <td className="num">{a.tenureMonths} mo</td>
                      <td className="num">{formatRate(a.annualRateBps)}</td>
                      <td className="num">{formatRupees(a.emiPaise)}</td>
                      <td><StatusBadge status={a.status} /></td>
                      <td className="muted">{formatDate(a.updatedAt)}</td>
                      <td>
                        <button type="button" onClick={() => setSelectedId(a.id)}>
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </button>
              <span className="muted">
                Page {list.page} of {list.totalPages} · {list.total} total
              </span>
              <button type="button" disabled={page >= list.totalPages} onClick={() => setPage(page + 1)}>
                Next
              </button>
            </div>
          </>
        )}
      </section>

      {selectedId !== null && (
        <ApplicationDetails key={selectedId} id={selectedId} onChanged={refresh} onClose={() => setSelectedId(null)} />
      )}
    </main>
  );
}
