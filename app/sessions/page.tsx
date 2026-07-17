"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type Turf = {
  id: string;
  name: string;
  location: string | null;
  day_rate_per_hour: number;
  night_rate_per_hour: number;
};

type Player = {
  id: string;
  name: string;
};

export default function SessionsPage() {
  const [turfs, setTurfs] = useState<Turf[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [enableVoting, setEnableVoting] = useState(true);

  const [form, setForm] = useState({
    session_name: "Sunday Cricket",
    session_date: new Date().toISOString().slice(0, 10),
    turf_id: "",
    booking_type: "day",
    hours_booked: 2,
    overs_per_match: 7,
    captain_a: "",
    captain_b: "",
    notes: "",
    voting_deadline: "",
    venue_note: "Venue may change depending on rain.",
  });

  async function loadData() {
    const { data: turfData, error: turfError } = await supabase
      .from("turfs")
      .select("*")
      .order("name");

    const { data: playerData, error: playerError } = await supabase
      .from("players")
      .select("id,name")
      .eq("is_active", true)
      .order("name");

    if (turfError) {
      alert(turfError.message);
      return;
    }

    if (playerError) {
      alert(playerError.message);
      return;
    }

    setTurfs(turfData || []);
    setPlayers(playerData || []);

    if (turfData && turfData.length > 0) {
      const nagaon =
        turfData.find((turf) => turf.name.toLowerCase().includes("nagaon")) ||
        turfData[0];

      setForm((prev) => ({
        ...prev,
        turf_id: prev.turf_id || nagaon.id,
      }));
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const selectedTurf = turfs.find((t) => t.id === form.turf_id);

  const rateUsed = useMemo(() => {
    if (!selectedTurf) return 0;

    return form.booking_type === "night"
      ? Number(selectedTurf.night_rate_per_hour)
      : Number(selectedTurf.day_rate_per_hour);
  }, [selectedTurf, form.booking_type]);

  const bookingAmount = rateUsed * Number(form.hours_booked || 0);
  const perPlayerShare =
    selectedPlayers.length > 0 ? bookingAmount / selectedPlayers.length : 0;

  function togglePlayer(id: string) {
    setSelectedPlayers((prev) =>
      prev.includes(id)
        ? prev.filter((playerId) => playerId !== id)
        : [...prev, id]
    );
  }

  async function createSession() {
    if (!form.turf_id) {
      alert("Please select turf");
      return;
    }

    if (!enableVoting && selectedPlayers.length === 0) {
      const proceed = confirm(
        "No players are selected. Create the session anyway?"
      );
      if (!proceed) return;
    }

    setLoading(true);

    const { data: session, error } = await supabase
      .from("sessions")
      .insert({
        session_name: form.session_name,
        session_date: form.session_date,
        turf_id: form.turf_id,
        booking_type: form.booking_type,
        hours_booked: form.hours_booked,
        rate_used_per_hour: rateUsed,
        booking_amount: bookingAmount,
        overs_per_match: form.overs_per_match,
        captain_a: form.captain_a,
        captain_b: form.captain_b,
        notes: form.notes,
        status: "planned",
        voting_enabled: enableVoting,
        voting_deadline:
          enableVoting && form.voting_deadline
            ? new Date(form.voting_deadline).toISOString()
            : null,
        default_turf_id: form.turf_id,
        confirmed_turf_id: form.turf_id,
        venue_note: enableVoting ? form.venue_note || null : null,
        voting_status: enableVoting ? "open" : "closed",
      })
      .select()
      .single();

    if (error) {
      setLoading(false);
      alert(error.message);
      return;
    }

    if (!enableVoting && selectedPlayers.length > 0) {
      const rows = selectedPlayers.map((playerId) => ({
        session_id: session.id,
        player_id: playerId,
        amount_paid: 0,
        payment_method: null,
      }));

      const { error: playerError } = await supabase
        .from("session_players")
        .insert(rows);

      if (playerError) {
        setLoading(false);
        alert(playerError.message);
        return;
      }
    }

    setLoading(false);
    window.location.href = enableVoting
      ? `/vote/${session.id}`
      : `/sessions/${session.id}`;
  }

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mx-auto max-w-6xl">
        <a href="/" className="text-sm text-slate-400">
          ← Back to Dashboard
        </a>

        <h1 className="mt-4 text-4xl font-bold">📅 Create Session</h1>
        <p className="mt-2 text-slate-300">
          Create a Sunday cricket session, choose the proposed turf and collect
          player confirmations using one WhatsApp link.
        </p>

        <section className="mt-8 rounded-2xl bg-slate-900 p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Session Name"
              value={form.session_name}
              onChange={(value) => setForm({ ...form, session_name: value })}
            />
            <Input
              label="Date"
              type="date"
              value={form.session_date}
              onChange={(value) => setForm({ ...form, session_date: value })}
            />

            <div>
              <label className="mb-2 block text-sm text-slate-300">
                Proposed Turf
              </label>
              <select
                className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3"
                value={form.turf_id}
                onChange={(event) =>
                  setForm({ ...form, turf_id: event.target.value })
                }
              >
                {turfs.map((turf) => (
                  <option key={turf.id} value={turf.id}>
                    {turf.name}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-slate-400">
                Nagaon is selected automatically when available. You can change
                the final turf later if rain affects the plan.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">
                Booking Type
              </label>
              <select
                className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3"
                value={form.booking_type}
                onChange={(event) =>
                  setForm({ ...form, booking_type: event.target.value })
                }
              >
                <option value="day">Day</option>
                <option value="night">Night</option>
              </select>
            </div>

            <Input
              label="Hours Booked"
              type="number"
              value={String(form.hours_booked)}
              onChange={(value) =>
                setForm({ ...form, hours_booked: Number(value) })
              }
            />
            <Input
              label="Overs Per Match"
              type="number"
              value={String(form.overs_per_match)}
              onChange={(value) =>
                setForm({ ...form, overs_per_match: Number(value) })
              }
            />
            <Input
              label="Captain / Team A"
              value={form.captain_a}
              onChange={(value) => setForm({ ...form, captain_a: value })}
            />
            <Input
              label="Captain / Team B"
              value={form.captain_b}
              onChange={(value) => setForm({ ...form, captain_b: value })}
            />
          </div>

          <div className="mt-6 rounded-2xl border border-slate-700 bg-slate-800 p-5">
            <h2 className="text-xl font-semibold">💰 Booking Summary</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-4">
              <Summary label="Rate" value={`₹${rateUsed}/hr`} />
              <Summary label="Hours" value={String(form.hours_booked)} />
              <Summary label="Booking" value={`₹${bookingAmount}`} />
              <Summary
                label="Manual Per Player"
                value={
                  selectedPlayers.length > 0
                    ? `₹${perPlayerShare.toFixed(2)}`
                    : "-"
                }
              />
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-green-500/30 bg-green-500/10 p-6">
          <div className="flex items-start gap-3">
            <input
              id="enable-voting"
              type="checkbox"
              checked={enableVoting}
              onChange={(event) => setEnableVoting(event.target.checked)}
              className="mt-1 h-5 w-5"
            />
            <label htmlFor="enable-voting" className="cursor-pointer">
              <span className="block text-xl font-bold text-green-300">
                Enable Public Voting
              </span>
              <span className="mt-1 block text-sm text-slate-300">
                Create one public link for WhatsApp. Players tap their own names
                to confirm.
              </span>
            </label>
          </div>

          {enableVoting && (
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Input
                label="Voting Deadline (optional)"
                type="datetime-local"
                value={form.voting_deadline}
                onChange={(value) =>
                  setForm({ ...form, voting_deadline: value })
                }
              />
              <Input
                label="Venue Message"
                value={form.venue_note}
                onChange={(value) => setForm({ ...form, venue_note: value })}
              />
            </div>
          )}
        </section>

        {!enableVoting && (
          <section className="mt-8 rounded-2xl bg-slate-900 p-6">
            <h2 className="text-2xl font-semibold">
              👥 Select Players Manually
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Selected: {selectedPlayers.length}
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {players.map((player) => {
                const selected = selectedPlayers.includes(player.id);
                return (
                  <button
                    type="button"
                    key={player.id}
                    onClick={() => togglePlayer(player.id)}
                    className={`flex items-center gap-3 rounded-xl border p-3 text-left ${
                      selected
                        ? "border-green-400 bg-green-500/20 text-green-200"
                        : "border-slate-700 bg-slate-800"
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                        selected
                          ? "border-green-300 bg-green-400 text-slate-950"
                          : "border-slate-500"
                      }`}
                    >
                      {selected ? "✓" : ""}
                    </span>
                    <span>{player.name}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section className="mt-8 rounded-2xl bg-slate-900 p-6">
          <label className="mb-2 block text-sm text-slate-300">Notes</label>
          <textarea
            className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3"
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
            placeholder="Optional notes"
          />

          <button
            type="button"
            onClick={createSession}
            disabled={loading}
            className="mt-5 rounded-xl bg-green-500 px-6 py-3 font-semibold text-slate-950 disabled:opacity-50"
          >
            {loading
              ? "Creating..."
              : enableVoting
                ? "Create Session & Open Voting"
                : "Create Session"}
          </button>
        </section>
      </div>
    </main>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm text-slate-300">{label}</label>
      <input
        type={type}
        className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-900 p-4">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}