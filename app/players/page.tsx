"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type Player = {
  id: string;
  name: string;
  mobile: string | null;
  is_active: boolean;
};

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadPlayers() {
    const { data, error } = await supabase
      .from("players")
      .select("*")
      .order("name");

    if (!error && data) setPlayers(data);
  }

  async function addPlayer() {
    if (!name.trim()) return;

    setLoading(true);

    const { error } = await supabase.from("players").insert({
      name: name.trim(),
      mobile: mobile.trim() || null,
      is_active: true,
    });

    setLoading(false);

    if (error) {
      alert(error.message);
      return;
    }

    setName("");
    setMobile("");
    loadPlayers();
  }

  async function deletePlayer(id: string) {
    const { error } = await supabase.from("players").delete().eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    loadPlayers();
  }

  useEffect(() => {
    loadPlayers();
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mx-auto max-w-5xl">
        <a href="/" className="text-sm text-slate-400">
          ← Back to Dashboard
        </a>

        <h1 className="mt-4 text-4xl font-bold">👥 Players</h1>
        <p className="mt-2 text-slate-300">
          Master player list. Add regular players once and use them every Sunday.
        </p>

        <section className="mt-8 rounded-2xl bg-slate-900 p-6">
          <h2 className="text-2xl font-semibold">Add Player</h2>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <input
              className="rounded-xl border border-slate-700 bg-slate-800 p-3"
              placeholder="Player name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <input
              className="rounded-xl border border-slate-700 bg-slate-800 p-3"
              placeholder="Mobile optional"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
            />

            <button
              onClick={addPlayer}
              disabled={loading}
              className="rounded-xl bg-green-500 px-4 py-3 font-semibold text-slate-950"
            >
              {loading ? "Adding..." : "Add Player"}
            </button>
          </div>
        </section>

        <section className="mt-8 rounded-2xl bg-slate-900 p-6">
          <h2 className="text-2xl font-semibold">Player List</h2>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-slate-300">
                  <th className="py-3">Name</th>
                  <th className="py-3">Mobile</th>
                  <th className="py-3">Status</th>
                  <th className="py-3">Action</th>
                </tr>
              </thead>

              <tbody>
                {players.map((player) => (
                  <tr key={player.id} className="border-b border-slate-800">
                    <td className="py-3 font-medium">{player.name}</td>
                    <td className="py-3">{player.mobile || "-"}</td>
                    <td className="py-3">
                      {player.is_active ? "Active" : "Inactive"}
                    </td>
                    <td className="py-3">
                      <button
                        onClick={() => deletePlayer(player.id)}
                        className="rounded-lg border border-red-400 px-3 py-1 text-red-300"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}

                {players.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-slate-400">
                      No players added yet.
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