"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../../lib/supabase";

type Player = {
  id: string;
  name: string;
  phone_number: string | null;
  sms_opt_in: boolean | null;
  whatsapp_opt_in: boolean | null;
};

type SessionPlayer = {
  id: string;
  player_id: string;
  amount_paid: number;
  payment_method: string | null;
  players: Player | null;
};

type Expense = {
  id: string;
  description: string;
  amount: number;
  created_at: string;
};

type SessionFinanceData = {
  id: string;
  session_name: string;
  session_date: string;
  booking_amount: number | null;
  session_status: "open" | "ended" | null;
  ended_at: string | null;
  final_total_amount: number | null;
  final_amount_per_player: number | null;
  session_expenses: Expense[];
  session_players: SessionPlayer[];
  matches: {
    id: string;
    match_number: number;
    match_status: string | null;
  }[];
};

type SessionFinanceProps = {
  sessionId: string;
  isAdmin: boolean;
  onChanged?: () => void | Promise<void>;
};

function normaliseIndianNumber(phone: string | null | undefined) {
  const digits = (phone || "").replace(/\D/g, "");

  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;

  return "";
}

export default function SessionFinance({
  sessionId,
  isAdmin,
  onChanged,
}: SessionFinanceProps) {
  const [data, setData] = useState<SessionFinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingExpense, setSavingExpense] = useState(false);
  const [endingSession, setEndingSession] = useState(false);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [whatsAppQueueIndex, setWhatsAppQueueIndex] = useState(0);
  const [whatsAppQueueStarted, setWhatsAppQueueStarted] = useState(false);

  async function loadFinance() {
    setLoading(true);

    const { data: financeData, error } = await supabase
      .from("sessions")
      .select(`
        id,
        session_name,
        session_date,
        booking_amount,
        session_status,
        ended_at,
        final_total_amount,
        final_amount_per_player,
        session_expenses (
          id,
          description,
          amount,
          created_at
        ),
        session_players (
          id,
          player_id,
          amount_paid,
          payment_method,
          players (
            id,
            name,
            phone_number,
            sms_opt_in,
            whatsapp_opt_in
          )
        ),
        matches (
          id,
          match_number,
          match_status
        )
      `)
      .eq("id", sessionId)
      .single();

    setLoading(false);

    if (error) {
      alert(error.message);
      return;
    }

    setData(financeData as unknown as SessionFinanceData);
  }

  useEffect(() => {
    loadFinance();
  }, [sessionId]);

  const summary = useMemo(() => {
    const booking = Number(data?.booking_amount || 0);

    const additionalExpenses = (data?.session_expenses || []).reduce(
      (sum, expense) => sum + Number(expense.amount || 0),
      0
    );

    const calculatedTotal = booking + additionalExpenses;
    const playerCount = data?.session_players?.length || 0;
    const ended = data?.session_status === "ended";

    const totalCost = ended
      ? Number(data?.final_total_amount || calculatedTotal)
      : calculatedTotal;

    const perPlayer = ended
      ? Number(data?.final_amount_per_player || 0)
      : playerCount > 0
        ? totalCost / playerCount
        : 0;

    const collected = (data?.session_players || []).reduce(
      (sum, row) => sum + Number(row.amount_paid || 0),
      0
    );

    return {
      booking,
      additionalExpenses,
      totalCost,
      playerCount,
      perPlayer,
      collected,
      pending: Math.max(totalCost - collected, 0),
    };
  }, [data]);

  const sessionEnded = data?.session_status === "ended";

  async function addExpense(
    descriptionOverride?: string,
    amountOverride?: number
  ) {
    if (!isAdmin) {
      alert("Please log in as admin.");
      return;
    }

    if (sessionEnded) {
      alert("This session has ended and expenses are locked.");
      return;
    }

    const expenseDescription = (
      descriptionOverride ?? description
    ).trim();

    const expenseAmount =
      amountOverride ?? Number(amount);

    if (!expenseDescription) {
      alert("Please enter an expense description.");
      return;
    }

    if (!Number.isFinite(expenseAmount) || expenseAmount <= 0) {
      alert("Please enter a valid amount.");
      return;
    }

    setSavingExpense(true);

    const { error } = await supabase
      .from("session_expenses")
      .insert({
        session_id: sessionId,
        description: expenseDescription,
        amount: expenseAmount,
      });

    setSavingExpense(false);

    if (error) {
      alert(error.message);
      return;
    }

    setDescription("");
    setAmount("");

    await loadFinance();
    await onChanged?.();
  }

  async function deleteExpense(expenseId: string) {
    if (!isAdmin || sessionEnded) return;

    if (!confirm("Delete this expense?")) return;

    const { error } = await supabase
      .from("session_expenses")
      .delete()
      .eq("id", expenseId);

    if (error) {
      alert(error.message);
      return;
    }

    await loadFinance();
    await onChanged?.();
  }

  async function endSession() {
    if (!isAdmin || !data) return;

    if (sessionEnded) {
      alert("This session has already ended.");
      return;
    }

    if (summary.playerCount === 0) {
      alert("Add players before ending the session.");
      return;
    }

    const incompleteMatches = (data.matches || []).filter(
      (match) =>
        match.match_status &&
        match.match_status !== "completed"
    );

    if (
      incompleteMatches.length > 0 &&
      !confirm(
        `${incompleteMatches.length} match(es) are not completed. End the session anyway?`
      )
    ) {
      return;
    }

    if (
      !confirm(
        `End this session?\n\nTotal: ₹${summary.totalCost.toFixed(
          2
        )}\nPlayers: ${summary.playerCount}\nEach player: ₹${summary.perPlayer.toFixed(
          2
        )}\n\nThe final share will be frozen.`
      )
    ) {
      return;
    }

    setEndingSession(true);

    const { error: sessionError } = await supabase
      .from("sessions")
      .update({
        session_status: "ended",
        ended_at: new Date().toISOString(),
        final_total_amount: summary.totalCost,
        final_amount_per_player: summary.perPlayer,
      })
      .eq("id", sessionId);

    if (sessionError) {
      setEndingSession(false);
      alert(sessionError.message);
      return;
    }

    await supabase
      .from("session_payment_notifications")
      .delete()
      .eq("session_id", sessionId);

    const rows = (data.session_players || []).flatMap((row) => {
      const paid = Number(row.amount_paid || 0);
      const due = Math.max(summary.perPlayer - paid, 0);
      const phone = row.players?.phone_number || null;

      if (due <= 0) return [];

      return [
        {
          session_id: sessionId,
          player_id: row.player_id,
          phone_number: phone,
          player_share: summary.perPlayer,
          already_paid: paid,
          amount_due: due,
          channel: "sms",
          delivery_status:
            phone && row.players?.sms_opt_in !== false
              ? "pending"
              : "skipped",
        },
        {
          session_id: sessionId,
          player_id: row.player_id,
          phone_number: phone,
          player_share: summary.perPlayer,
          already_paid: paid,
          amount_due: due,
          channel: "whatsapp",
          delivery_status:
            phone && row.players?.whatsapp_opt_in !== false
              ? "pending"
              : "skipped",
        },
      ];
    });

    if (rows.length > 0) {
      const { error } = await supabase
        .from("session_payment_notifications")
        .insert(rows);

      if (error) {
        console.error(error.message);
      }
    }

    setEndingSession(false);

    await loadFinance();
    await onChanged?.();

    alert(
      "Session ended. Final balances and WhatsApp messages are ready."
    );
  }

  function getWhatsAppUrl(row: SessionPlayer) {
    if (!data) return "";

    const phone = normaliseIndianNumber(
      row.players?.phone_number
    );

    if (!phone) return "";

    const paid = Number(row.amount_paid || 0);
    const due = Math.max(summary.perPlayer - paid, 0);
    const qrUrl =
      process.env.NEXT_PUBLIC_PAYMENT_QR_URL || "";

    const message = [
      `Hi ${row.players?.name || "there"},`,
      "",
      `Your cricket payment for ${data.session_name} on ${data.session_date}:`,
      `Your share: ₹${summary.perPlayer.toFixed(2)}`,
      `Already paid: ₹${paid.toFixed(2)}`,
      `Balance due: ₹${due.toFixed(2)}`,
      "",
      qrUrl
        ? `Payment QR: ${qrUrl}`
        : "Please pay using the Cricket Hub QR code.",
      "",
      "Thank you.",
    ].join("\n");

    return `https://wa.me/${phone}?text=${encodeURIComponent(
      message
    )}`;
  }


  const whatsAppQueue = useMemo(() => {
    if (!data || !sessionEnded) return [];

    return data.session_players
      .map((row) => {
        const paid = Number(row.amount_paid || 0);
        const due = Math.max(summary.perPlayer - paid, 0);
        const url = getWhatsAppUrl(row);

        return { row, due, url };
      })
      .filter(
        (item) =>
          item.due > 0 &&
          Boolean(item.url) &&
          item.row.players?.whatsapp_opt_in !== false
      );
  }, [data, sessionEnded, summary.perPlayer]);

  function startWhatsAppQueue() {
    if (whatsAppQueue.length === 0) {
      alert("No unpaid players with valid WhatsApp numbers were found.");
      return;
    }

    setWhatsAppQueueIndex(0);
    setWhatsAppQueueStarted(true);
  }

  function openNextWhatsApp() {
    const current = whatsAppQueue[whatsAppQueueIndex];

    if (!current) {
      setWhatsAppQueueStarted(false);
      alert("All WhatsApp reminders have been opened.");
      return;
    }

    window.open(current.url, "_blank", "noopener,noreferrer");

    const nextIndex = whatsAppQueueIndex + 1;

    if (nextIndex >= whatsAppQueue.length) {
      setWhatsAppQueueIndex(nextIndex);
      setWhatsAppQueueStarted(false);
    } else {
      setWhatsAppQueueIndex(nextIndex);
    }
  }

  function resetWhatsAppQueue() {
    setWhatsAppQueueStarted(false);
    setWhatsAppQueueIndex(0);
  }

  if (loading) {
    return (
      <section className="mt-8 rounded-2xl bg-slate-900 p-6">
        <p className="text-slate-400">
          Loading session expenses...
        </p>
      </section>
    );
  }

  if (!data) return null;

  return (
    <>
      <section className="mt-8 rounded-2xl bg-slate-900 p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold">
              🧾 Additional Expenses
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Add bananas, Glucon-D, water or another shared
              expense.
            </p>
          </div>

          <span
            className={`rounded-full px-3 py-2 text-sm font-semibold ${
              sessionEnded
                ? "bg-red-500/20 text-red-300"
                : "bg-green-500/20 text-green-300"
            }`}
          >
            {sessionEnded ? "Locked" : "Open"}
          </span>
        </div>

        {!sessionEnded && isAdmin && (
          <>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <input
                value={description}
                onChange={(event) =>
                  setDescription(event.target.value)
                }
                placeholder="Expense description"
                className="rounded-xl border border-slate-700 bg-slate-800 p-3"
              />

              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(event) =>
                  setAmount(event.target.value)
                }
                placeholder="Amount"
                className="rounded-xl border border-slate-700 bg-slate-800 p-3"
              />

              <button
                onClick={() => addExpense()}
                disabled={savingExpense}
                className="rounded-xl bg-green-500 px-5 py-3 font-semibold text-slate-950 disabled:opacity-50"
              >
                {savingExpense ? "Adding..." : "Add Expense"}
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <QuickButton
                label="Bananas ₹100"
                onClick={() => addExpense("Bananas", 100)}
              />
              <QuickButton
                label="Glucon-D ₹200"
                onClick={() => addExpense("Glucon-D", 200)}
              />
              <QuickButton
                label="Water ₹100"
                onClick={() => addExpense("Water", 100)}
              />
            </div>
          </>
        )}

        <div className="mt-5 space-y-3">
          {data.session_expenses.length === 0 && (
            <p className="text-slate-500">
              No additional expenses.
            </p>
          )}

          {[...data.session_expenses]
            .sort(
              (a, b) =>
                new Date(a.created_at).getTime() -
                new Date(b.created_at).getTime()
            )
            .map((expense) => (
              <div
                key={expense.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-slate-700 bg-slate-800 p-4"
              >
                <div>
                  <p className="font-semibold">
                    {expense.description}
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    ₹{Number(expense.amount).toFixed(2)}
                  </p>
                </div>

                {!sessionEnded && isAdmin && (
                  <button
                    onClick={() => deleteExpense(expense.id)}
                    className="rounded-lg border border-red-400 px-3 py-2 text-sm text-red-300"
                  >
                    Delete
                  </button>
                )}
              </div>
            ))}
        </div>
      </section>

      <section className="mt-8 rounded-2xl bg-slate-900 p-6">
        <h2 className="text-2xl font-semibold">
          💰 Final Cost Summary
        </h2>

        <div className="mt-5 grid gap-4 md:grid-cols-4">
          <Card
            label="Booking"
            value={`₹${summary.booking.toFixed(2)}`}
          />
          <Card
            label="Other Expenses"
            value={`₹${summary.additionalExpenses.toFixed(2)}`}
          />
          <Card
            label="Total Cost"
            value={`₹${summary.totalCost.toFixed(2)}`}
          />
          <Card
            label="Each Pays"
            value={`₹${summary.perPlayer.toFixed(2)}`}
          />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Card
            label="Players"
            value={String(summary.playerCount)}
          />
          <Card
            label="Collected"
            value={`₹${summary.collected.toFixed(2)}`}
          />
          <Card
            label="Pending"
            value={`₹${summary.pending.toFixed(2)}`}
          />
        </div>
      </section>

      {!sessionEnded && isAdmin && (
        <section className="mt-8 rounded-2xl border border-red-500/30 bg-slate-900 p-6">
          <h2 className="text-2xl font-semibold">
            🏁 End Session
          </h2>

          <p className="mt-2 text-slate-300">
            This freezes the total and equal player share, then
            prepares individual payment reminders.
          </p>

          <button
            onClick={endSession}
            disabled={endingSession}
            className="mt-5 rounded-xl bg-red-500 px-6 py-3 font-semibold text-white disabled:opacity-50"
          >
            {endingSession
              ? "Ending Session..."
              : "End Session & Freeze Payments"}
          </button>
        </section>
      )}

      {sessionEnded && (
        <section className="mt-8 rounded-2xl border border-green-500/30 bg-slate-900 p-6">
          <h2 className="text-2xl font-semibold">
            📲 Individual Payment Messages
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            WhatsApp opens a personalised message. Automatic SMS
            will be enabled after the SMS provider and DLT settings
            are connected.
          </p>

          <div className="mt-5 rounded-2xl border border-green-500/30 bg-green-500/10 p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-bold text-green-300">
                  Send WhatsApp reminders in sequence
                </h3>

                <p className="mt-1 text-sm text-slate-300">
                  Use one queue for all unpaid players. WhatsApp still
                  requires you to press Send for each message.
                </p>

                <p className="mt-2 text-sm text-slate-400">
                  Ready: {whatsAppQueue.length} player
                  {whatsAppQueue.length === 1 ? "" : "s"}
                </p>
              </div>

              {!whatsAppQueueStarted ? (
                <button
                  type="button"
                  onClick={startWhatsAppQueue}
                  disabled={whatsAppQueue.length === 0}
                  className="rounded-xl bg-green-500 px-5 py-3 font-semibold text-slate-950 disabled:opacity-40"
                >
                  Start WhatsApp Queue
                </button>
              ) : (
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={openNextWhatsApp}
                    className="rounded-xl bg-green-500 px-5 py-3 font-semibold text-slate-950"
                  >
                    Open Next WhatsApp (
                    {Math.min(
                      whatsAppQueueIndex + 1,
                      whatsAppQueue.length
                    )}
                    /{whatsAppQueue.length})
                  </button>

                  <button
                    type="button"
                    onClick={resetWhatsAppQueue}
                    className="rounded-xl border border-slate-500 px-5 py-3 text-slate-300"
                  >
                    Stop Queue
                  </button>
                </div>
              )}
            </div>

            {whatsAppQueueStarted &&
              whatsAppQueue[whatsAppQueueIndex] && (
                <div className="mt-4 rounded-xl bg-slate-900 p-4">
                  <p className="text-sm text-slate-400">
                    Next player
                  </p>

                  <p className="mt-1 font-semibold">
                    {
                      whatsAppQueue[whatsAppQueueIndex].row.players
                        ?.name
                    }
                    {" • "}₹
                    {whatsAppQueue[
                      whatsAppQueueIndex
                    ].due.toFixed(2)} due
                  </p>
                </div>
              )}
          </div>

          <div className="mt-5 space-y-3">
            {data.session_players.map((row) => {
              const paid = Number(row.amount_paid || 0);
              const due = Math.max(
                summary.perPlayer - paid,
                0
              );
              const whatsappUrl = getWhatsAppUrl(row);
              const phoneAvailable = Boolean(
                normaliseIndianNumber(
                  row.players?.phone_number
                )
              );

              return (
                <div
                  key={row.id}
                  className="grid gap-4 rounded-xl border border-slate-700 bg-slate-800 p-4 md:grid-cols-[1fr_auto]"
                >
                  <div>
                    <p className="font-semibold">
                      {row.players?.name || "Unknown player"}
                    </p>

                    <p className="mt-1 text-sm text-slate-300">
                      Share ₹{summary.perPlayer.toFixed(2)} •
                      Paid ₹{paid.toFixed(2)} • Due ₹
                      {due.toFixed(2)}
                    </p>

                    {!phoneAvailable && (
                      <p className="mt-2 text-sm text-yellow-300">
                        Indian mobile number not added.
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {due > 0 && whatsappUrl && (
                      <a
                        href={whatsappUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-slate-950"
                      >
                        WhatsApp
                      </a>
                    )}

                    <button
                      disabled
                      title="Connect MSG91 or Exotel and DLT settings first"
                      className="rounded-lg border border-blue-400 px-4 py-2 text-sm text-blue-300 opacity-50"
                    >
                      SMS Pending Setup
                    </button>

                    {due <= 0 && (
                      <span className="rounded-lg bg-green-500/20 px-4 py-2 text-sm text-green-300">
                        Paid
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}

function Card({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-slate-800 p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function QuickButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700"
    >
      + {label}
    </button>
  );
}