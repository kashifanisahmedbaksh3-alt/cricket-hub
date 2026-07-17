"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";

type Expense = {
  id: string;
  description: string;
  amount: number | null;
};

type SessionPlayer = {
  id: string;
  amount_paid: number | null;
  payment_method: string | null;
};

type Turf = {
  id: string;
  name: string;
};

type FinanceSession = {
  id: string;
  session_name: string;
  session_date: string;
  booking_amount: number | null;
  session_status: string | null;
  final_total_amount: number | null;
  final_amount_per_player: number | null;
  turfs: Turf | null;
  session_expenses: Expense[];
  session_players: SessionPlayer[];
};

type SessionRow = {
  id: string;
  sessionName: string;
  sessionDate: string;
  turfName: string;
  status: string;
  booking: number;
  extras: number;
  spent: number;
  received: number;
  expected: number;
  outstanding: number;
  balance: number;
  cash: number;
  gpay: number;
  playerCount: number;
};

type MonthRow = {
  key: string;
  label: string;
  spent: number;
  received: number;
  outstanding: number;
  balance: number;
};

export default function FinanceReportsPage() {
  const [sessions, setSessions] = useState<FinanceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [turfFilter, setTurfFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  async function loadAdminStatus() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    setIsAdmin(
      user?.email?.toLowerCase() ===
        "kashifanisahmedbaksh3@gmail.com"
    );
    setAuthChecked(true);
  }

  async function loadFinanceReport() {
    setLoading(true);

    const { data, error } = await supabase
      .from("sessions")
      .select(`
        id,
        session_name,
        session_date,
        booking_amount,
        session_status,
        final_total_amount,
        final_amount_per_player,
        turfs (
          id,
          name
        ),
        session_expenses (
          id,
          description,
          amount
        ),
        session_players (
          id,
          amount_paid,
          payment_method
        )
      `)
      .order("session_date", { ascending: false });

    setLoading(false);

    if (error) {
      alert(error.message);
      return;
    }

    setSessions((data || []) as unknown as FinanceSession[]);
  }

  useEffect(() => {
    loadAdminStatus();
    loadFinanceReport();
  }, []);

  const allRows = useMemo<SessionRow[]>(() => {
    return sessions.map((session) => {
      const booking = Number(session.booking_amount || 0);

      const extras = (session.session_expenses || []).reduce(
        (sum, expense) => sum + Number(expense.amount || 0),
        0
      );

      const spent = booking + extras;

      const received = (session.session_players || []).reduce(
        (sum, player) => sum + Number(player.amount_paid || 0),
        0
      );

      const cash = (session.session_players || [])
        .filter((player) => player.payment_method === "cash")
        .reduce(
          (sum, player) => sum + Number(player.amount_paid || 0),
          0
        );

      const gpay = (session.session_players || [])
        .filter((player) => player.payment_method === "gpay")
        .reduce(
          (sum, player) => sum + Number(player.amount_paid || 0),
          0
        );

      const expected =
        session.session_status === "ended"
          ? Number(session.final_total_amount || spent)
          : spent;

      return {
        id: session.id,
        sessionName: session.session_name || "Cricket Session",
        sessionDate: session.session_date,
        turfName: session.turfs?.name || "Turf not set",
        status: session.session_status || "open",
        booking,
        extras,
        spent,
        received,
        expected,
        outstanding: Math.max(expected - received, 0),
        balance: received - spent,
        cash,
        gpay,
        playerCount: session.session_players?.length || 0,
      };
    });
  }, [sessions]);

  const turfNames = useMemo(
    () =>
      Array.from(new Set(allRows.map((row) => row.turfName))).sort(),
    [allRows]
  );

  const filteredRows = useMemo(() => {
    return allRows.filter((row) => {
      if (fromDate && row.sessionDate < fromDate) return false;
      if (toDate && row.sessionDate > toDate) return false;
      if (turfFilter !== "all" && row.turfName !== turfFilter) {
        return false;
      }
      if (statusFilter !== "all" && row.status !== statusFilter) {
        return false;
      }

      return true;
    });
  }, [allRows, fromDate, toDate, turfFilter, statusFilter]);

  const totals = useMemo(() => {
    return filteredRows.reduce(
      (result, row) => {
        result.booking += row.booking;
        result.extras += row.extras;
        result.spent += row.spent;
        result.received += row.received;
        result.expected += row.expected;
        result.outstanding += row.outstanding;
        result.cash += row.cash;
        result.gpay += row.gpay;
        return result;
      },
      {
        booking: 0,
        extras: 0,
        spent: 0,
        received: 0,
        expected: 0,
        outstanding: 0,
        cash: 0,
        gpay: 0,
      }
    );
  }, [filteredRows]);

  const balance = totals.received - totals.spent;

  const months = useMemo<MonthRow[]>(() => {
    const groups = new Map<string, MonthRow>();

    filteredRows.forEach((row) => {
      const date = new Date(`${row.sessionDate}T00:00:00`);
      const key = `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, "0")}`;

      const existing = groups.get(key) || {
        key,
        label: new Intl.DateTimeFormat("en-IN", {
          month: "short",
          year: "numeric",
        }).format(date),
        spent: 0,
        received: 0,
        outstanding: 0,
        balance: 0,
      };

      existing.spent += row.spent;
      existing.received += row.received;
      existing.outstanding += row.outstanding;
      existing.balance += row.balance;

      groups.set(key, existing);
    });

    return Array.from(groups.values()).sort((a, b) =>
      a.key.localeCompare(b.key)
    );
  }, [filteredRows]);

  const maxMonthlyValue = Math.max(
    1,
    ...months.flatMap((month) => [month.spent, month.received])
  );

  const paymentTotal = totals.cash + totals.gpay;
  const cashPercent =
    paymentTotal > 0 ? (totals.cash / paymentTotal) * 100 : 0;
  const gpayPercent =
    paymentTotal > 0 ? (totals.gpay / paymentTotal) * 100 : 0;

  function resetFilters() {
    setFromDate("");
    setToDate("");
    setTurfFilter("all");
    setStatusFilter("all");
  }

  if (!authChecked || loading) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        Loading finance report...
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        <div className="mx-auto max-w-3xl rounded-3xl border border-red-500/30 bg-red-500/10 p-8">
          <h1 className="text-3xl font-bold">Admin access required</h1>
          <p className="mt-3 text-slate-300">
            Please log in with the Cricket Hub administrator account to
            view financial reports.
          </p>
          <a
            href="/login"
            className="mt-6 inline-block rounded-xl bg-green-500 px-5 py-3 font-semibold text-slate-950"
          >
            Go to Login
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 p-5 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <a href="/" className="text-sm text-slate-400">
              ← Back to Dashboard
            </a>

            <h1 className="mt-3 text-4xl font-black">
              💰 Finance Reports
            </h1>

            <p className="mt-2 text-slate-300">
              Track spending, payments received, outstanding amounts and
              the remaining cash balance.
            </p>
          </div>

          <button
            type="button"
            onClick={loadFinanceReport}
            className="rounded-xl border border-slate-600 px-5 py-3 text-slate-200"
          >
            ↻ Refresh Report
          </button>
        </div>

        <section className="mt-7 rounded-3xl bg-slate-900 p-6">
          <h2 className="text-xl font-bold">Report Filters</h2>

          <div className="mt-4 grid gap-4 md:grid-cols-5">
            <FilterInput
              label="From Date"
              type="date"
              value={fromDate}
              onChange={setFromDate}
            />

            <FilterInput
              label="To Date"
              type="date"
              value={toDate}
              onChange={setToDate}
            />

            <div>
              <label className="mb-2 block text-sm text-slate-400">
                Turf
              </label>

              <select
                value={turfFilter}
                onChange={(event) =>
                  setTurfFilter(event.target.value)
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3"
              >
                <option value="all">All Turfs</option>
                {turfNames.map((turf) => (
                  <option key={turf} value={turf}>
                    {turf}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-400">
                Session Status
              </label>

              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value)
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3"
              >
                <option value="all">All Sessions</option>
                <option value="open">Open</option>
                <option value="ended">Ended</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={resetFilters}
                className="w-full rounded-xl border border-slate-600 px-5 py-3 text-slate-300"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Total Spent"
            value={formatMoney(totals.spent)}
            description={`${formatMoney(totals.booking)} turf + ${formatMoney(
              totals.extras
            )} extras`}
            tone="red"
          />

          <SummaryCard
            label="Total Received"
            value={formatMoney(totals.received)}
            description={`${filteredRows.length} session${
              filteredRows.length === 1 ? "" : "s"
            }`}
            tone="green"
          />

          <SummaryCard
            label="Outstanding"
            value={formatMoney(totals.outstanding)}
            description="Still due from players"
            tone="yellow"
          />

          <SummaryCard
            label="Remaining Balance"
            value={formatMoney(balance)}
            description={
              balance >= 0
                ? "Money remaining after expenses"
                : "Amount paid from your pocket"
            }
            tone={balance >= 0 ? "blue" : "red"}
          />
        </section>

        <section className="mt-6 grid gap-5 lg:grid-cols-2">
          <div className="rounded-3xl bg-slate-900 p-6">
            <h2 className="text-2xl font-bold">
              Received versus Spent
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Overall financial position for the selected period.
            </p>

            <div className="mt-7 space-y-6">
              <HorizontalBar
                label="Received"
                value={totals.received}
                max={Math.max(totals.received, totals.spent, 1)}
                valueLabel={formatMoney(totals.received)}
                fillClass="bg-green-500"
              />

              <HorizontalBar
                label="Spent"
                value={totals.spent}
                max={Math.max(totals.received, totals.spent, 1)}
                valueLabel={formatMoney(totals.spent)}
                fillClass="bg-red-500"
              />

              <HorizontalBar
                label="Outstanding"
                value={totals.outstanding}
                max={Math.max(
                  totals.received,
                  totals.spent,
                  totals.outstanding,
                  1
                )}
                valueLabel={formatMoney(totals.outstanding)}
                fillClass="bg-yellow-500"
              />
            </div>
          </div>

          <div className="rounded-3xl bg-slate-900 p-6">
            <h2 className="text-2xl font-bold">
              Payment Method Split
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Cash and GPay payments received.
            </p>

            <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row">
              <div
                className="relative flex h-48 w-48 shrink-0 items-center justify-center rounded-full"
                style={{
                  background:
                    paymentTotal > 0
                      ? `conic-gradient(#3b82f6 0 ${cashPercent}%, #22c55e ${cashPercent}% 100%)`
                      : "#334155",
                }}
              >
                <div className="flex h-32 w-32 flex-col items-center justify-center rounded-full bg-slate-900">
                  <span className="text-2xl font-black">
                    {formatMoney(paymentTotal)}
                  </span>
                  <span className="text-xs text-slate-400">
                    received
                  </span>
                </div>
              </div>

              <div className="w-full space-y-3">
                <LegendRow
                  label="Cash"
                  value={formatMoney(totals.cash)}
                  percent={cashPercent}
                  dotClass="bg-blue-500"
                />

                <LegendRow
                  label="GPay"
                  value={formatMoney(totals.gpay)}
                  percent={gpayPercent}
                  dotClass="bg-green-500"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-3xl bg-slate-900 p-6">
          <h2 className="text-2xl font-bold">Monthly Trend</h2>

          <p className="mt-1 text-sm text-slate-400">
            Monthly spending and collections.
          </p>

          {months.length === 0 ? (
            <p className="mt-6 text-slate-400">
              No finance data is available for the selected filters.
            </p>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <div
                className="flex min-w-max items-end gap-5"
                style={{ minHeight: 280 }}
              >
                {months.map((month) => (
                  <div key={month.key} className="w-36 shrink-0">
                    <div className="flex h-52 items-end justify-center gap-3 rounded-2xl bg-slate-800 p-4">
                      <VerticalBar
                        value={month.received}
                        max={maxMonthlyValue}
                        label={formatCompactMoney(month.received)}
                        fillClass="bg-green-500"
                      />

                      <VerticalBar
                        value={month.spent}
                        max={maxMonthlyValue}
                        label={formatCompactMoney(month.spent)}
                        fillClass="bg-red-500"
                      />
                    </div>

                    <p className="mt-3 text-center font-semibold">
                      {month.label}
                    </p>

                    <p
                      className={`mt-1 text-center text-xs ${
                        month.balance >= 0
                          ? "text-blue-300"
                          : "text-red-300"
                      }`}
                    >
                      Balance {formatMoney(month.balance)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap gap-5 text-sm">
                <span className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-green-500" />
                  Received
                </span>

                <span className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-red-500" />
                  Spent
                </span>
              </div>
            </div>
          )}
        </section>

        <section className="mt-6 rounded-3xl bg-slate-900 p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold">
                Session-wise Report
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                Detailed spending and payment position for every session.
              </p>
            </div>

            <p className="text-sm text-slate-400">
              Showing {filteredRows.length} session
              {filteredRows.length === 1 ? "" : "s"}
            </p>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400">
                  <th className="px-3 py-4">Date</th>
                  <th className="px-3 py-4">Session</th>
                  <th className="px-3 py-4">Turf</th>
                  <th className="px-3 py-4 text-right">Booking</th>
                  <th className="px-3 py-4 text-right">Extras</th>
                  <th className="px-3 py-4 text-right">Spent</th>
                  <th className="px-3 py-4 text-right">Received</th>
                  <th className="px-3 py-4 text-right">Outstanding</th>
                  <th className="px-3 py-4 text-right">Balance</th>
                  <th className="px-3 py-4">Players</th>
                  <th className="px-3 py-4">Status</th>
                </tr>
              </thead>

              <tbody>
                {filteredRows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-slate-800"
                  >
                    <td className="px-3 py-4">
                      {formatDate(row.sessionDate)}
                    </td>

                    <td className="px-3 py-4 font-semibold">
                      <a
                        href={`/sessions/${row.id}`}
                        className="hover:text-green-300"
                      >
                        {row.sessionName}
                      </a>
                    </td>

                    <td className="px-3 py-4">{row.turfName}</td>
                    <td className="px-3 py-4 text-right">
                      {formatMoney(row.booking)}
                    </td>
                    <td className="px-3 py-4 text-right">
                      {formatMoney(row.extras)}
                    </td>
                    <td className="px-3 py-4 text-right font-semibold text-red-300">
                      {formatMoney(row.spent)}
                    </td>
                    <td className="px-3 py-4 text-right font-semibold text-green-300">
                      {formatMoney(row.received)}
                    </td>
                    <td className="px-3 py-4 text-right text-yellow-300">
                      {formatMoney(row.outstanding)}
                    </td>
                    <td
                      className={`px-3 py-4 text-right font-semibold ${
                        row.balance >= 0
                          ? "text-blue-300"
                          : "text-red-300"
                      }`}
                    >
                      {formatMoney(row.balance)}
                    </td>
                    <td className="px-3 py-4">
                      {row.playerCount}
                    </td>
                    <td className="px-3 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs ${
                          row.status === "ended"
                            ? "bg-slate-700 text-slate-200"
                            : "bg-green-500/20 text-green-300"
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}

                {filteredRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={11}
                      className="px-3 py-10 text-center text-slate-400"
                    >
                      No sessions match the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  description,
  tone,
}: {
  label: string;
  value: string;
  description: string;
  tone: "green" | "red" | "yellow" | "blue";
}) {
  const toneClasses = {
    green: "border-green-500/30 bg-green-500/10 text-green-300",
    red: "border-red-500/30 bg-red-500/10 text-red-300",
    yellow:
      "border-yellow-500/30 bg-yellow-500/10 text-yellow-300",
    blue: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  };

  return (
    <div className={`rounded-3xl border p-5 ${toneClasses[tone]}`}>
      <p className="text-sm">{label}</p>
      <p className="mt-2 text-3xl font-black">{value}</p>
      <p className="mt-2 text-xs text-slate-400">{description}</p>
    </div>
  );
}

function FilterInput({
  label,
  type,
  value,
  onChange,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm text-slate-400">
        {label}
      </label>

      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3"
      />
    </div>
  );
}

function HorizontalBar({
  label,
  value,
  max,
  valueLabel,
  fillClass,
}: {
  label: string;
  value: number;
  max: number;
  valueLabel: string;
  fillClass: string;
}) {
  const percentage = Math.max(
    value > 0 ? 3 : 0,
    Math.min((value / max) * 100, 100)
  );

  return (
    <div>
      <div className="mb-2 flex justify-between gap-3">
        <span className="text-sm text-slate-300">{label}</span>
        <span className="font-semibold">{valueLabel}</span>
      </div>

      <div className="h-5 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full ${fillClass}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function VerticalBar({
  value,
  max,
  label,
  fillClass,
}: {
  value: number;
  max: number;
  label: string;
  fillClass: string;
}) {
  const percentage = Math.max(
    value > 0 ? 4 : 0,
    Math.min((value / max) * 100, 100)
  );

  return (
    <div className="flex h-full w-12 flex-col items-center justify-end">
      <span className="mb-2 text-[10px] text-slate-300">
        {label}
      </span>

      <div
        className={`w-full rounded-t-lg ${fillClass}`}
        style={{ height: `${percentage}%` }}
      />
    </div>
  );
}

function LegendRow({
  label,
  value,
  percent,
  dotClass,
}: {
  label: string;
  value: string;
  percent: number;
  dotClass: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-800 p-4">
      <div className="flex items-center gap-3">
        <span className={`h-4 w-4 rounded-full ${dotClass}`} />
        <span>{label}</span>
      </div>

      <div className="text-right">
        <p className="font-bold">{value}</p>
        <p className="text-xs text-slate-400">
          {percent.toFixed(1)}%
        </p>
      </div>
    </div>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function formatCompactMoney(value: number) {
  return new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value || 0);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}