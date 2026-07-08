"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function CaptainsPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [captainA, setCaptainA] = useState("");
  const [captainB, setCaptainB] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadSessions() {
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
      return;
    }

    setSessions(data || []);
    if (data && data.length > 0 && !selectedSessionId) {
      setSelectedSessionId(data[0].id);
    }
  }

  useEffect(() => {
    loadSessions();
  }, []);

  const selectedSession = sessions.find((s) => s.id === selectedSessionId);

  const confirmedPlayers =
    selectedSession?.session_players?.map((row: any) => row.players?.name).filter(Boolean) || [];

  const previousCaptains = useMemo(() => {
    return sessions
      .filter((s) => s.id !== selectedSessionId)
      .flatMap((s) => [s.captain_a, s.captain_b])
      .filter(Boolean);
  }, [sessions, selectedSessionId]);

  function suggestCaptains() {
    if (confirmedPlayers.length < 2) {
      alert("At least 2 confirmed players are needed.");
      return;
    }

    const recentCaptains = new Set(previousCaptains.slice(0, 6));

    let eligible = confirmedPlayers.filter((name: string) => !recentCaptains.has(name));

    if (eligible.length < 2) {
      eligible = confirmedPlayers.filter((name: string) => !previousCaptains.slice(0, 2).includes(name));
    }

    if (eligible.length < 2) {
      eligible = confirmedPlayers;
    }

    const shuffled = [...eligible].sort(() => Math.random() - 0.5);

    setCaptainA(shuffled[0]);
    setCaptainB(shuffled[1]);
  }

  async function saveCaptains() {
    if (!selectedSession || !captainA || !captainB) {
      alert("Please suggest or select both captains.");
      return;
    }

    setSaving(true);

    const { error } = await supabase
      .from("sessions")
      .update({
        captain_a: captainA,
        captain_b: captainB,
      })
      .eq("id", selectedSession.id);

    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    alert("Captains saved!");
    loadSessions();
  }

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mx-auto max-w-6xl">
        <Link href="/" className="text-sm text-slate-400">
          ← Back to Dashboard
        </Link>

        <h1 className="mt-4 text-4xl font-bold">👑 Captain Auto Picker</h1>
        <p className="mt-2 text-slate-300">
          Select captains from confirmed players while avoiding recent repeats.
        </p>

        <section className="mt-8 rounded-3xl bg-slate-900 p-6">
          <h2 className="text-2xl font-bold">🗓️ Select Session</h2>

          <select
            value={selectedSessionId}
            onChange={(e) => {
              setSelectedSessionId(e.target.value);
              setCaptainA("");
              setCaptainB("");
            }}
            className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-800 p-3"
          >
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.session_date} - {session.session_name} - {session.turfs?.name}
              </option>
            ))}
          </select>
        </section>

        {selectedSession && (
          <>
            <section className="mt-8 rounded-3xl bg-slate-900 p-6">
              <h2 className="text-2xl font-bold">Confirmed Players</h2>
              <p className="mt-2 text-slate-400">
                Total: {confirmedPlayers.length}
              </p>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {confirmedPlayers.map((name: string) => {
                  const wasRecentCaptain = previousCaptains.slice(0, 6).includes(name);

                  return (
                    <div
                      key={name}
                      className="rounded-xl border border-slate-700 bg-slate-800 p-4"
                    >
                      <p className="font-semibold">{name}</p>
                      {wasRecentCaptain && (
                        <p className="mt-1 text-xs text-yellow-300">
                          Recent captain
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="mt-8 rounded-3xl bg-slate-900 p-6">
              <h2 className="text-2xl font-bold">Suggested Captains</h2>

              <button
                onClick={suggestCaptains}
                className="mt-4 rounded-xl bg-green-500 px-5 py-3 font-semibold text-slate-950"
              >
                Suggest Captains
              </button>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm text-slate-300">
                    Captain A
                  </label>
                  <select
                    value={captainA}
                    onChange={(e) => setCaptainA(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3"
                  >
                    <option value="">Select captain</option>
                    {confirmedPlayers.map((name: string) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-300">
                    Captain B
                  </label>
                  <select
                    value={captainB}
                    onChange={(e) => setCaptainB(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3"
                  >
                    <option value="">Select captain</option>
                    {confirmedPlayers.map((name: string) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                onClick={saveCaptains}
                disabled={saving}
                className="mt-6 rounded-xl bg-blue-500 px-5 py-3 font-semibold text-white"
              >
                {saving ? "Saving..." : "Save Captains to Session"}
              </button>
            </section>

            <section className="mt-8 rounded-3xl bg-slate-900 p-6">
              <h2 className="text-2xl font-bold">Recent Captain History</h2>

              <div className="mt-4 space-y-3">
                {sessions
                  .filter((s) => s.id !== selectedSessionId)
                  .slice(0, 5)
                  .map((session) => (
                    <div
                      key={session.id}
                      className="rounded-xl border border-slate-700 bg-slate-800 p-4"
                    >
                      <p className="font-semibold">
                        {session.session_date} - {session.session_name}
                      </p>
                      <p className="mt-1 text-sm text-slate-400">
                        {session.captain_a || "-"} vs {session.captain_b || "-"}
                      </p>
                    </div>
                  ))}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}