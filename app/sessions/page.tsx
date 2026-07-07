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
  });

  async function loadData() {
    const { data: turfData } = await supabase.from("turfs").select("*").order("name");
    const { data: playerData } = await supabase
      .from("players")
      .select("id,name")
      .eq("is_active", true)
      .order("name");

    setTurfs(turfData || []);
    setPlayers(playerData || []);

    if (turfData && turfData.length > 0) {
      setForm((prev) => ({ ...prev, turf_id: prev.turf_id || turfData[0].id }));
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
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  async function createSession() {
    if (!form.turf_id) {
      alert("Please select turf");
      return;
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
      })
      .select()
      .single();

    if (error) {
      setLoading(false);
      alert(error.message);
      return;
    }

    if (selectedPlayers.length > 0) {
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
    window.location.href = `/sessions/${session.id}`;
  }

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mx-auto max-w-6xl">
        <a href="/" className="text-sm text-slate-400">← Back to Dashboard</a>

        <h1 className="mt-4 text-4xl font-bold">📅 Create Session</h1>
        <p className="mt-2 text-slate-300">
          Create a Sunday cricket session, select turf, players and auto-calculate split.
        </p>

        <section className="mt-8 rounded-2xl bg-slate-900 p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="Session Name" value={form.session_name} onChange={(v) => setForm({ ...form, session_name: v })} />
            <Input label="Date" type="date" value={form.session_date} onChange={(v) => setForm({ ...form, session_date: v })} />

            <div>
              <label className="mb-2 block text-sm text-slate-300">Turf</label>
              <select
                className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3"
                value={form.turf_id}
                onChange={(e) => setForm({ ...form, turf_id: e.target.value })}
              >
                {turfs.map((turf) => (
                  <option key={turf.id} value={turf.id}>
                    {turf.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">Booking Type</label>
              <select
                className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3"
                value={form.booking_type}
                onChange={(e) => setForm({ ...form, booking_type: e.target.value })}
              >
                <option value="day">Day</option>
                <option value="night">Night</option>
              </select>
            </div>

            <Input label="Hours Booked" type="number" value={String(form.hours_booked)} onChange={(v) => setForm({ ...form, hours_booked: Number(v) })} />
            <Input label="Overs Per Match" type="number" value={String(form.overs_per_match)} onChange={(v) => setForm({ ...form, overs_per_match: Number(v) })} />
            <Input label="Captain / Team A" value={form.captain_a} onChange={(v) => setForm({ ...form, captain_a: v })} />
            <Input label="Captain / Team B" value={form.captain_b} onChange={(v) => setForm({ ...form, captain_b: v })} />
          </div>

          <div className="mt-6 rounded-2xl border border-slate-700 bg-slate-800 p-5">
            <h2 className="text-xl font-semibold">💰 Booking Summary</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-4">
              <Summary label="Rate" value={`₹${rateUsed}/hr`} />
              <Summary label="Hours" value={String(form.hours_booked)} />
              <Summary label="Booking" value={`₹${bookingAmount}`} />
              <Summary label="Per Player" value={`₹${perPlayerShare.toFixed(2)}`} />
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-2xl bg-slate-900 p-6">
          <h2 className="text-2xl font-semibold">👥 Select Players</h2>
          <p className="mt-1 text-sm text-slate-400">
            Selected: {selectedPlayers.length}
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {players.map((player) => (
              <label
                key={player.id}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-700 bg-slate-800 p-3"
              >
                <input
                  type="checkbox"
                  checked={selectedPlayers.includes(player.id)}
                  onChange={() => togglePlayer(player.id)}
                />
                <span>{player.name}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-2xl bg-slate-900 p-6">
          <label className="mb-2 block text-sm text-slate-300">Notes</label>
          <textarea
            className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Optional notes"
          />

          <button
            onClick={createSession}
            disabled={loading}
            className="mt-5 rounded-xl bg-green-500 px-6 py-3 font-semibold text-slate-950"
          >
            {loading ? "Creating..." : "Create Session"}
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
        onChange={(e) => onChange(e.target.value)}
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