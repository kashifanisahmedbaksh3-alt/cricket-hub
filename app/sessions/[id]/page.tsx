"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";

type SessionPlayer = {
  id: string;
  player_id: string;
  amount_paid: number;
  payment_method: string | null;
  players: {
    name: string;
  };
};

type Player = {
  id: string;
  name: string;
  is_active: boolean;
};

type Match = {
  id: string;
  match_number: number;
  team_a: string | null;
  team_b: string | null;
  team_a_runs: number | null;
  team_a_wickets: number | null;
  team_b_runs: number | null;
  team_b_wickets: number | null;
  overs: number | null;
  winner: string | null;
  player_of_match: string | null;
  youtube_url: string | null;
  youtube_video_id: string | null;
  match_notes: string | null;
};

function getYouTubeId(url: string) {
  if (!url) return "";
  const regex =
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([^&?/]+)/;
  const match = url.match(regex);
  return match ? match[1] : "";
}

export default function SessionDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [session, setSession] = useState<any>(null);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [selectedNewPlayerId, setSelectedNewPlayerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingMatch, setSavingMatch] = useState(false);
  const [openMatchId, setOpenMatchId] = useState<string | null>(null);

  const [matchForm, setMatchForm] = useState({
    match_number: "",
    team_a: "",
    team_b: "",
    team_a_runs: "",
    team_a_wickets: "",
    team_b_runs: "",
    team_b_wickets: "",
    overs: "7",
    winner: "",
    player_of_match: "",
    youtube_url: "",
    match_notes: "",
  });

  async function loadSession() {
    setLoading(true);

    const { data, error } = await supabase
      .from("sessions")
      .select(`
        *,
        turfs (*),
        session_players (
          *,
          players (*)
        ),
        matches (*)
      `)
      .eq("id", id)
      .single();

    if (error) {
      alert(error.message);
    } else {
      setSession(data);
    }

    const { data: playerData } = await supabase
      .from("players")
      .select("id,name,is_active")
      .eq("is_active", true)
      .order("name");

    setAllPlayers(playerData || []);
    setLoading(false);
  }

  useEffect(() => {
    loadSession();
  }, [id]);

  const summary = useMemo(() => {
    if (!session) {
      return {
        playerCount: 0,
        perPlayer: 0,
        collected: 0,
        pending: 0,
        cash: 0,
        gpay: 0,
      };
    }

    const players = session.session_players || [];
    const playerCount = players.length;
    const booking = Number(session.booking_amount || 0);
    const perPlayer = playerCount > 0 ? booking / playerCount : 0;

    const collected = players.reduce(
      (sum: number, row: SessionPlayer) => sum + Number(row.amount_paid || 0),
      0
    );

    const cash = players
      .filter((row: SessionPlayer) => row.payment_method === "cash")
      .reduce(
        (sum: number, row: SessionPlayer) => sum + Number(row.amount_paid || 0),
        0
      );

    const gpay = players
      .filter((row: SessionPlayer) => row.payment_method === "gpay")
      .reduce(
        (sum: number, row: SessionPlayer) => sum + Number(row.amount_paid || 0),
        0
      );

    return {
      playerCount,
      perPlayer,
      collected,
      pending: booking - collected,
      cash,
      gpay,
    };
  }, [session]);

  async function addPlayerToSession() {
    if (!selectedNewPlayerId) {
      alert("Please select a player");
      return;
    }

    const alreadyAdded = session.session_players?.some(
      (row: SessionPlayer) => row.player_id === selectedNewPlayerId
    );

    if (alreadyAdded) {
      alert("Player already added to this session");
      return;
    }

    const { error } = await supabase.from("session_players").insert({
      session_id: id,
      player_id: selectedNewPlayerId,
      amount_paid: 0,
      payment_method: null,
    });

    if (error) {
      alert(error.message);
      return;
    }

    setSelectedNewPlayerId("");
    loadSession();
  }

  async function removePlayerFromSession(sessionPlayerId: string) {
    const confirmRemove = confirm("Remove this player from this session?");
    if (!confirmRemove) return;

    const { error } = await supabase
      .from("session_players")
      .delete()
      .eq("id", sessionPlayerId);

    if (error) {
      alert(error.message);
      return;
    }

    loadSession();
  }

  async function markPayment(
    sessionPlayerId: string,
    amount: number,
    method: "cash" | "gpay" | null
  ) {
    const { error } = await supabase
      .from("session_players")
      .update({
        amount_paid: amount,
        payment_method: method,
      })
      .eq("id", sessionPlayerId);

    if (error) {
      alert(error.message);
      return;
    }

    loadSession();
  }

  async function addMatch() {
    if (!matchForm.match_number) {
      alert("Please enter match number");
      return;
    }

    setSavingMatch(true);

    const youtubeVideoId = getYouTubeId(matchForm.youtube_url);

    const { error } = await supabase.from("matches").insert({
      session_id: id,
      match_number: Number(matchForm.match_number),
      team_a: matchForm.team_a || null,
      team_b: matchForm.team_b || null,
      team_a_runs: Number(matchForm.team_a_runs || 0),
      team_a_wickets: Number(matchForm.team_a_wickets || 0),
      team_b_runs: Number(matchForm.team_b_runs || 0),
      team_b_wickets: Number(matchForm.team_b_wickets || 0),
      overs: Number(matchForm.overs || 7),
      winner: matchForm.winner || null,
      player_of_match: matchForm.player_of_match || null,
      youtube_url: matchForm.youtube_url || null,
      youtube_video_id: youtubeVideoId || null,
      match_notes: matchForm.match_notes || null,
    });

    setSavingMatch(false);

    if (error) {
      alert(error.message);
      return;
    }

    setMatchForm({
      match_number: "",
      team_a: "",
      team_b: "",
      team_a_runs: "",
      team_a_wickets: "",
      team_b_runs: "",
      team_b_wickets: "",
      overs: "7",
      winner: "",
      player_of_match: "",
      youtube_url: "",
      match_notes: "",
    });

    loadSession();
  }

  async function deleteMatch(matchId: string) {
    const confirmDelete = confirm("Delete this match?");
    if (!confirmDelete) return;

    const { error } = await supabase.from("matches").delete().eq("id", matchId);

    if (error) {
      alert(error.message);
      return;
    }

    loadSession();
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        Loading...
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        Session not found.
      </main>
    );
  }

  const matches = [...(session.matches || [])].sort(
    (a: Match, b: Match) => a.match_number - b.match_number
  );

  const availablePlayers = allPlayers.filter(
    (player) =>
      !session.session_players?.some(
        (row: SessionPlayer) => row.player_id === player.id
      )
  );

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mx-auto max-w-6xl">
        <a href="/sessions" className="text-sm text-slate-400">
          ← Back to Sessions
        </a>

        <h1 className="mt-4 text-4xl font-bold">🏏 {session.session_name}</h1>
        <p className="mt-2 text-slate-300">
          {session.session_date} • {session.turfs?.name}
        </p>

        <section className="mt-8 grid gap-4 md:grid-cols-4">
          <Card label="Booking" value={`₹${Number(session.booking_amount).toFixed(2)}`} />
          <Card label="Players" value={String(summary.playerCount)} />
          <Card label="Per Player" value={`₹${summary.perPlayer.toFixed(2)}`} />
          <Card label="Pending" value={`₹${summary.pending.toFixed(2)}`} />
        </section>

        <section className="mt-4 grid gap-4 md:grid-cols-3">
          <Card label="Collected" value={`₹${summary.collected.toFixed(2)}`} />
          <Card label="Cash" value={`₹${summary.cash.toFixed(2)}`} />
          <Card label="GPay" value={`₹${summary.gpay.toFixed(2)}`} />
        </section>

        <section className="mt-8 rounded-2xl bg-slate-900 p-6">
          <h2 className="text-2xl font-semibold">👥 Manage Session Players</h2>
          <p className="mt-1 text-sm text-slate-400">
            Add late joiners or remove players who cancelled. The share amount recalculates automatically.
          </p>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <select
              value={selectedNewPlayerId}
              onChange={(e) => setSelectedNewPlayerId(e.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-800 p-3"
            >
              <option value="">Select player to add</option>
              {availablePlayers.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name}
                </option>
              ))}
            </select>

            <button
              onClick={addPlayerToSession}
              className="rounded-xl bg-green-500 px-5 py-3 font-semibold text-slate-950"
            >
              Add Player to Session
            </button>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {session.session_players?.map((row: SessionPlayer) => (
              <div
                key={row.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-800 p-3"
              >
                <span>{row.players?.name}</span>
                <button
                  onClick={() => removePlayerFromSession(row.id)}
                  className="rounded-lg border border-red-400 px-3 py-1 text-xs text-red-300"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-2xl bg-slate-900 p-6">
          <h2 className="text-2xl font-semibold">💰 Payments</h2>
          <p className="mt-1 text-sm text-slate-400">
            One-click payment update. Share amount is calculated automatically.
          </p>

          <div className="mt-4 overflow-x-auto">
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
                {session.session_players?.map((row: SessionPlayer) => {
                  const paid = Number(row.amount_paid || 0);
                  const due = Math.max(summary.perPlayer - paid, 0);
                  const isPaid = paid >= summary.perPlayer;

                  return (
                    <tr key={row.id} className="border-b border-slate-800">
                      <td className="py-3 font-medium">{row.players?.name}</td>
                      <td className="py-3">₹{summary.perPlayer.toFixed(2)}</td>
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
                            markPayment(row.id, summary.perPlayer, "cash")
                          }
                          className="rounded-lg bg-blue-500 px-3 py-1 text-xs font-semibold text-white"
                        >
                          Paid Cash
                        </button>

                        <button
                          onClick={() =>
                            markPayment(row.id, summary.perPlayer, "gpay")
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

        <section id="matches" className="mt-8 rounded-2xl bg-slate-900 p-6">
          <h2 className="text-2xl font-semibold">🏏 Match Centre</h2>
          <p className="mt-1 text-sm text-slate-400">
            Add match scores, winner, player of the match and YouTube link.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Input label="Match Number" value={matchForm.match_number} onChange={(v) => setMatchForm({ ...matchForm, match_number: v })} type="number" />
            <Input label="Overs" value={matchForm.overs} onChange={(v) => setMatchForm({ ...matchForm, overs: v })} type="number" />

            <Input label="Team A" value={matchForm.team_a} onChange={(v) => setMatchForm({ ...matchForm, team_a: v })} />
            <Input label="Team B" value={matchForm.team_b} onChange={(v) => setMatchForm({ ...matchForm, team_b: v })} />

            <Input label="Team A Runs" value={matchForm.team_a_runs} onChange={(v) => setMatchForm({ ...matchForm, team_a_runs: v })} type="number" />
            <Input label="Team A Wickets" value={matchForm.team_a_wickets} onChange={(v) => setMatchForm({ ...matchForm, team_a_wickets: v })} type="number" />

            <Input label="Team B Runs" value={matchForm.team_b_runs} onChange={(v) => setMatchForm({ ...matchForm, team_b_runs: v })} type="number" />
            <Input label="Team B Wickets" value={matchForm.team_b_wickets} onChange={(v) => setMatchForm({ ...matchForm, team_b_wickets: v })} type="number" />

            <Input label="Winner" value={matchForm.winner} onChange={(v) => setMatchForm({ ...matchForm, winner: v })} />
            <Input label="Player of Match" value={matchForm.player_of_match} onChange={(v) => setMatchForm({ ...matchForm, player_of_match: v })} />

            <div className="md:col-span-2">
              <Input label="YouTube URL" value={matchForm.youtube_url} onChange={(v) => setMatchForm({ ...matchForm, youtube_url: v })} />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm text-slate-300">
                Match Notes
              </label>
              <textarea
                className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3"
                value={matchForm.match_notes}
                onChange={(e) =>
                  setMatchForm({ ...matchForm, match_notes: e.target.value })
                }
                placeholder="Example: Last ball thriller, great sixes and catches..."
              />
            </div>
          </div>

          <button
            onClick={addMatch}
            disabled={savingMatch}
            className="mt-5 rounded-xl bg-green-500 px-6 py-3 font-semibold text-slate-950"
          >
            {savingMatch ? "Saving..." : "Add Match"}
          </button>

          <div className="mt-8 space-y-4">
            {matches.length === 0 && (
              <p className="text-slate-400">No matches added yet.</p>
            )}

            {matches.map((match: Match) => {
              const isOpen = openMatchId === match.id;

              return (
                <div
                  key={match.id}
                  className="rounded-2xl border border-slate-700 bg-slate-800 p-5"
                >
                  <div
                    className="flex cursor-pointer items-center justify-between gap-4"
                    onClick={() => setOpenMatchId(isOpen ? null : match.id)}
                  >
                    <div>
                      <h3 className="text-xl font-bold">
                        {isOpen ? "▼" : "▶"} Match {match.match_number}
                      </h3>
                      <p className="mt-1 text-sm text-slate-400">
                        {match.team_a || "Team A"} vs {match.team_b || "Team B"}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-lg font-bold">
                        {match.team_a_runs ?? 0}/{match.team_a_wickets ?? 0} vs{" "}
                        {match.team_b_runs ?? 0}/{match.team_b_wickets ?? 0}
                      </p>
                      <p className="text-sm text-green-300">
                        🏆 {match.winner || "Winner not added"}
                      </p>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="mt-5 border-t border-slate-700 pt-5">
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-xl bg-slate-900 p-4">
                          <p className="text-sm text-slate-400">Team A</p>
                          <p className="mt-1 font-bold">{match.team_a || "-"}</p>
                          <p className="mt-2 text-3xl font-bold">
                            {match.team_a_runs ?? 0}/{match.team_a_wickets ?? 0}
                          </p>
                        </div>

                        <div className="rounded-xl bg-slate-900 p-4">
                          <p className="text-sm text-slate-400">Team B</p>
                          <p className="mt-1 font-bold">{match.team_b || "-"}</p>
                          <p className="mt-2 text-3xl font-bold">
                            {match.team_b_runs ?? 0}/{match.team_b_wickets ?? 0}
                          </p>
                        </div>
                      </div>

                      <p className="mt-4 font-semibold text-green-300">
                        🏆 Winner: {match.winner || "-"}
                      </p>

                      {match.player_of_match && (
                        <p className="mt-2 text-yellow-300">
                          ⭐ Player of Match: {match.player_of_match}
                        </p>
                      )}

                      {match.youtube_video_id && (
                        <div className="mt-4 overflow-hidden rounded-xl border border-slate-700">
                          <iframe
                            className="aspect-video w-full"
                            src={`https://www.youtube.com/embed/${match.youtube_video_id}`}
                            title={`Match ${match.match_number} video`}
                            allowFullScreen
                          />
                        </div>
                      )}

                      {match.match_notes && (
                        <p className="mt-4 text-sm text-slate-300">
                          {match.match_notes}
                        </p>
                      )}

                      <button
                        onClick={() => deleteMatch(match.id)}
                        className="mt-4 rounded-lg border border-red-400 px-3 py-1 text-xs text-red-300"
                      >
                        Delete Match
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-900 p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </div>
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