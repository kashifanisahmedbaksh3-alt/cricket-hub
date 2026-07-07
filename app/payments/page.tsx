"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type PaymentMethod = "cash" | "gpay" | null;

export default function PaymentsPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadSessions() {
    setLoading(true);

    const { data, error } = await supabase
      .from("sessions")
      .select(`
        *,
        turfs (*),
        session_players (
          *,
          players (*)
        )
      `)
      .order("session_date", { ascending: false });

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    setSessions(data || []);

    if (data && data.length > 0 && !selectedSessionId) {
      setSelectedSessionId(data[0].id);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadSessions();
  }, []);

  const selectedSession = sessions.find(
    (session) => session.id === selectedSessionId
  );

  const summary = useMemo(() => {
    if (!selectedSession) {
      return {
        booking: 0,
        players: 0,
        share: 0,
        collected: 0,
        pending: 0,
        cash: 0,
        gpay: 0,
      };
    }

    const rows = selectedSession.session_players || [];
    const booking = Number(selectedSession.booking_amount || 0);
    const players = rows.length;
    const share = players > 0 ? booking / players : 0;

    const collected = rows.reduce(
      (sum: number, row: any) => sum + Number(row.amount_paid || 0),
      0
    );

    const cash = rows
      .filter((row: any) => row.payment_method === "cash")
      .reduce((sum: number, row: any) => sum + Number(row.amount_paid || 0), 0);

    const gpay = rows
      .filter((row: any) => row.payment_method === "gpay")
      .reduce((sum: number, row: any) => sum + Number(row.amount_paid || 0), 0);

    return {
      booking,
      players,
      share,
      collected,
      pending: booking - collected,
      cash,
      gpay,
    };
  }, [selectedSession]);

  async function markPayment(
    rowId: string,
    amount: number,
    method: PaymentMethod
  ) {
    const { error } = await supabase
      .from("session_players")
      .update({
        amount_paid: amount,
        payment_method: method,
      })
      .eq("id", rowId);

    if (error) {
      alert(error.message);
      return;
    }

    await loadSessions();
  }

  function handleDateChange(dateValue: string) {
    const matchingSession = sessions.find(
      (session) => session.session_date === dateValue
    );

    if (matchingSession) {
      setSelectedSessionId(matchingSession.id);
    } else {
      setSelectedSessionId("");
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        Loading payments...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mx-auto max-w-6xl">
        <Link href="/" className="text-sm text-slate-400">
          ← Back to Dashboard
        </Link>

        <h1 className="mt-4 text-4xl font-bold">💰 Payments</h1>
        <p className="mt-2 text-slate-300">
          Select a cricket date and update payments for that day.
        </p>

        <section className="mt-8 rounded-3xl bg-slate-900 p-6">
          <h2 className="text-2xl font-bold">🗓️ Select Match Date</h2>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <input
              type="date"
              value={selectedSession?.session_date || ""}
              onChange={(e) => handleDateChange(e.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-800 p-3"
            />

            <select
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-800 p-3"
            >
              <option value="">Select session</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {new Date(session.session_date).toLocaleDateString("en-IN", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}{" "}
                  - {session.session_name} - {session.turfs?.name}
                </option>
              ))}
            </select>
          </div>
        </section>

        {!selectedSession && (
          <section className="mt-8 rounded-3xl bg-slate-900 p-6">
            <p className="text-slate-400">
              No cricket session found for selected date.
            </p>
          </section>
        )}

        {selectedSession && (
          <>
            <section className="mt-8 rounded-3xl bg-slate-900 p-6">
              <p className="text-sm text-slate-400">Selected Session</p>
              <h2 className="mt-2 text-3xl font-bold">
                {selectedSession.session_name}
              </h2>
              <p className="mt-1 text-slate-300">
                📅 {selectedSession.session_date} • 📍{" "}
                {selectedSession.turfs?.name}
              </p>

              <div className="mt-6 grid gap-4 md:grid-cols-4">
                <Card label="Booking" value={`₹${summary.booking.toFixed(2)}`} />
                <Card label="Players" value={String(summary.players)} />
                <Card label="Each Pays" value={`₹${summary.share.toFixed(2)}`} />
                <Card label="Pending" value={`₹${summary.pending.toFixed(2)}`} />
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <Card label="Collected" value={`₹${summary.collected.toFixed(2)}`} />
                <Card label="Cash" value={`₹${summary.cash.toFixed(2)}`} />
                <Card label="GPay" value={`₹${summary.gpay.toFixed(2)}`} />
              </div>
            </section>

            <section className="mt-8 rounded-3xl bg-slate-900 p-6">
              <h2 className="text-2xl font-bold">Player Payments</h2>

              <div className="mt-5 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-300">
                      <th className="py-3">Player</th>
                      <th className="py-3">Share</th>
                      <th className="py-3">Paid</th>
                      <th className="py-3">Due</th>
                      <th className="py-3">Method</th>
                      <th className="py-3">Status</th>
                      <th className="py-3">Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {selectedSession.session_players?.map((row: any) => {
                      const paid = Number(row.amount_paid || 0);
                      const due = Math.max(summary.share - paid, 0);
                      const isPaid = paid >= summary.share;

                      return (
                        <tr key={row.id} className="border-b border-slate-800">
                          <td className="py-3 font-medium">
                            {row.players?.name}
                          </td>
                          <td className="py-3">₹{summary.share.toFixed(2)}</td>
                          <td className="py-3">₹{paid.toFixed(2)}</td>
                          <td className="py-3">₹{due.toFixed(2)}</td>
                          <td className="py-3">{row.payment_method || "-"}</td>
                          <td className="py-3">
                            {isPaid ? (
                              <span className="rounded-full bg-green-500/20 px-3 py-1 text-green-300">
                                Paid
                              </span>
                            ) : paid > 0 ? (
                              <span className="rounded-full bg-yellow-500/20 px-3 py-1 text-yellow-300">
                                Partial
                              </span>
                            ) : (
                              <span className="rounded-full bg-red-500/20 px-3 py-1 text-red-300">
                                Pending
                              </span>
                            )}
                          </td>
                          <td className="flex flex-wrap gap-2 py-3">
                            <button
                              onClick={() =>
                                markPayment(row.id, summary.share, "cash")
                              }
                              className="rounded-lg bg-blue-500 px-3 py-1 text-xs font-semibold text-white"
                            >
                              Paid Cash
                            </button>

                            <button
                              onClick={() =>
                                markPayment(row.id, summary.share, "gpay")
                              }
                              className="rounded-lg bg-green-500 px-3 py-1 text-xs font-semibold text-slate-950"
                            >
                              Paid GPay
                            </button>

                            <button
                              onClick={() => markPayment(row.id, 0, null)}
                              className="rounded-lg border border-red-400 px-3 py-1 text-xs text-red-300"
                            >
                              Pending
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-800 p-4">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}