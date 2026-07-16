"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import LiveScorer from "./components/LiveScorer";

type Player = {
  id: string;
  name: string;
};

type SessionPlayerRow = {
  player_id: string;
  players: Player | null;
};

type SessionTeamPlayer = {
  player_id: string;
  team_side: "A" | "B";
  players: Player | null;
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
  result_text: string | null;
  match_status: string | null;
  current_innings: number | null;
  target_runs: number | null;
  toss_winner: string | null;
  toss_decision: "bat" | "bowl" | null;
  batting_first_side: "A" | "B" | null;
  batting_first_team: string | null;
  striker_id: string | null;
  non_striker_id: string | null;
  bowler_id: string | null;
};

type Session = {
  id: string;
  session_name: string;
  session_date: string;
  overs_per_match: number | null;
  team_a_name: string | null;
  team_b_name: string | null;
  captain_a_player_id: string | null;
  captain_b_player_id: string | null;
  turfs: {
    name: string;
  } | null;
  session_players: SessionPlayerRow[];
  session_team_players: SessionTeamPlayer[];
  matches: Match[];
};

const ADMIN_EMAIL = "kashifanisahmedbaksh3@gmail.com";

export default function AiUmpireV2Page() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [selectedMatchId, setSelectedMatchId] = useState("");
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [showAddMatch, setShowAddMatch] = useState(false);
  const [newMatchNumber, setNewMatchNumber] = useState("");
  const [newMatchOvers, setNewMatchOvers] = useState("7");
  const [creatingMatch, setCreatingMatch] = useState(false);

  async function loadAdminStatus() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    setIsAdmin(user?.email?.toLowerCase() === ADMIN_EMAIL);
  }

  async function loadSessions(preferredSessionId?: string) {
    setLoading(true);

    const { data, error } = await supabase
      .from("sessions")
      .select(`
        id,
        session_name,
        session_date,
        overs_per_match,
        team_a_name,
        team_b_name,
        captain_a_player_id,
        captain_b_player_id,
        turfs (
          name
        ),
        session_players (
          player_id,
          players (
            id,
            name
          )
        ),
        session_team_players (
          player_id,
          team_side,
          players (
            id,
            name
          )
        ),
        matches (
          id,
          match_number,
          team_a,
          team_b,
          team_a_runs,
          team_a_wickets,
          team_b_runs,
          team_b_wickets,
          overs,
          winner,
          result_text,
          match_status,
          current_innings,
          target_runs,
          toss_winner,
          toss_decision,
          batting_first_side,
          batting_first_team,
          striker_id,
          non_striker_id,
          bowler_id
        )
      `)
      .order("session_date", { ascending: false });

    setLoading(false);

    if (error) {
      alert(error.message);
      return;
    }

    const loadedSessions = (data || []) as unknown as Session[];
    setSessions(loadedSessions);

    if (loadedSessions.length === 0) {
      setSelectedSessionId("");
      setSelectedMatchId("");
      return;
    }

    const sessionId =
      preferredSessionId || selectedSessionId || loadedSessions[0].id;

    const chosenSession =
      loadedSessions.find((session) => session.id === sessionId) ||
      loadedSessions[0];

    setSelectedSessionId(chosenSession.id);

    const sortedMatches = [...(chosenSession.matches || [])].sort(
      (a, b) => a.match_number - b.match_number
    );

    const currentMatchStillExists = sortedMatches.some(
      (match) => match.id === selectedMatchId
    );

    if (!currentMatchStillExists) {
      setSelectedMatchId(sortedMatches[0]?.id || "");
    }
  }

  useEffect(() => {
    loadAdminStatus();
    loadSessions();
  }, []);

  const selectedSession = sessions.find(
    (session) => session.id === selectedSessionId
  );

  const matches = useMemo(() => {
    return [...(selectedSession?.matches || [])].sort(
      (a, b) => a.match_number - b.match_number
    );
  }, [selectedSession]);

  const selectedMatch = matches.find(
    (match) => match.id === selectedMatchId
  );

  const playerMap = useMemo(() => {
    const map = new Map<string, string>();

    selectedSession?.session_players.forEach((row) => {
      if (row.players) {
        map.set(row.players.id, row.players.name);
      }
    });

    return map;
  }, [selectedSession]);

  const captainAName =
    (selectedSession?.captain_a_player_id &&
      playerMap.get(selectedSession.captain_a_player_id)) ||
    "Not selected";

  const captainBName =
    (selectedSession?.captain_b_player_id &&
      playerMap.get(selectedSession.captain_b_player_id)) ||
    "Not selected";

  const teamAPlayers = useMemo(() => {
    return (
      selectedSession?.session_team_players
        .filter((row) => row.team_side === "A")
        .map((row) => row.players)
        .filter(Boolean) as Player[]
    ) || [];
  }, [selectedSession]);

  const teamBPlayers = useMemo(() => {
    return (
      selectedSession?.session_team_players
        .filter((row) => row.team_side === "B")
        .map((row) => row.players)
        .filter(Boolean) as Player[]
    ) || [];
  }, [selectedSession]);

  function handleSessionChange(sessionId: string) {
    setSelectedSessionId(sessionId);

    const session = sessions.find((item) => item.id === sessionId);
    const sortedMatches = [...(session?.matches || [])].sort(
      (a, b) => a.match_number - b.match_number
    );

    setSelectedMatchId(sortedMatches[0]?.id || "");
    setShowAddMatch(false);
  }

  function openAddMatch() {
    if (!selectedSession) return;

    if (!selectedSession.team_a_name || !selectedSession.team_b_name) {
      alert(
        "Please save the session captains and team names before creating a match."
      );
      return;
    }

    const nextNumber =
      matches.length === 0
        ? 1
        : Math.max(...matches.map((match) => match.match_number)) + 1;

    setNewMatchNumber(String(nextNumber));
    setNewMatchOvers(String(selectedSession.overs_per_match || 7));
    setShowAddMatch(true);
  }

  async function createMatch() {
    if (!isAdmin || !selectedSession) {
      alert("Please log in as admin.");
      return;
    }

    const matchNumber = Number(newMatchNumber);
    const overs = Number(newMatchOvers);

    if (!Number.isInteger(matchNumber) || matchNumber <= 0) {
      alert("Please enter a valid match number.");
      return;
    }

    if (!Number.isFinite(overs) || overs <= 0) {
      alert("Please enter valid overs.");
      return;
    }

    if (!selectedSession.team_a_name || !selectedSession.team_b_name) {
      alert("Session team names are not configured.");
      return;
    }

    setCreatingMatch(true);

    const { data, error } = await supabase
      .from("matches")
      .insert({
        session_id: selectedSession.id,
        match_number: matchNumber,
        overs,
        team_a: selectedSession.team_a_name,
        team_b: selectedSession.team_b_name,
        match_status: "not_started",
        current_innings: 1,
        team_a_runs: 0,
        team_a_wickets: 0,
        team_b_runs: 0,
        team_b_wickets: 0,
        toss_winner: null,
        toss_decision: null,
        batting_first_side: null,
        batting_first_team: null,
        striker_id: null,
        non_striker_id: null,
        bowler_id: null,
      })
      .select("id")
      .single();

    setCreatingMatch(false);

    if (error) {
      if (error.code === "23505") {
        alert(`Match ${matchNumber} already exists for this session.`);
      } else {
        alert(error.message);
      }

      return;
    }

    setShowAddMatch(false);

    await loadSessions(selectedSession.id);
    setSelectedMatchId(data.id);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        Loading AI Match Centre V2...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-white md:p-6">
      <div className="mx-auto max-w-7xl">
        <Link href="/" className="text-sm text-slate-400">
          ← Back to Dashboard
        </Link>

        <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-4xl font-bold">🤖 AI Match Centre V2</h1>

            <p className="mt-2 text-slate-300">
              Session-based teams, toss setup, match management and live
              scoring.
            </p>
          </div>

          <div
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${
              isAdmin
                ? "bg-green-500/20 text-green-300"
                : "bg-yellow-500/20 text-yellow-300"
            }`}
          >
            {isAdmin ? "👑 Admin controls enabled" : "👀 Public view-only"}
          </div>
        </div>

        <section className="mt-8 rounded-3xl bg-slate-900 p-6">
          <h2 className="text-2xl font-bold">Select Session</h2>

          <select
            value={selectedSessionId}
            onChange={(event) => handleSessionChange(event.target.value)}
            className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-800 p-3"
          >
            <option value="">Select session</option>

            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.session_date} - {session.session_name} -{" "}
                {session.turfs?.name || "Turf"}
              </option>
            ))}
          </select>
        </section>

        {selectedSession && (
          <>
            <section className="mt-8 grid gap-6 lg:grid-cols-2">
              <TeamCard
                title={selectedSession.team_a_name || "Team A"}
                captain={captainAName}
                players={teamAPlayers}
              />

              <TeamCard
                title={selectedSession.team_b_name || "Team B"}
                captain={captainBName}
                players={teamBPlayers}
              />
            </section>

            {teamAPlayers.length === 0 || teamBPlayers.length === 0 ? (
              <section className="mt-8 rounded-3xl border border-yellow-500/40 bg-yellow-500/10 p-6">
                <h2 className="text-xl font-bold text-yellow-300">
                  Session teams are incomplete
                </h2>

                <p className="mt-2 text-yellow-100">
                  Open the session and finish assigning players to both teams.
                  Captains and team names can be saved in advance, while
                  players can be assigned later at the turf.
                </p>

                <Link
                  href={`/sessions/${selectedSession.id}`}
                  className="mt-4 inline-block rounded-xl bg-yellow-400 px-5 py-3 font-semibold text-slate-950"
                >
                  Open Session Team Setup
                </Link>
              </section>
            ) : null}

            <section className="mt-8 rounded-3xl bg-slate-900 p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Matches</h2>

                  <p className="mt-1 text-sm text-slate-400">
                    Create and select matches without returning to the session
                    page.
                  </p>
                </div>

                {isAdmin && (
                  <button
                    onClick={openAddMatch}
                    className="rounded-xl bg-green-500 px-5 py-3 font-semibold text-slate-950"
                  >
                    + Add Match
                  </button>
                )}
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {matches.length === 0 && (
                  <p className="text-slate-400">
                    No matches created for this session.
                  </p>
                )}

                {matches.map((match) => {
                  const isSelected = match.id === selectedMatchId;

                  return (
                    <button
                      key={match.id}
                      type="button"
                      onClick={() => setSelectedMatchId(match.id)}
                      className={`rounded-2xl border p-5 text-left transition ${
                        isSelected
                          ? "border-green-400 bg-green-500/10"
                          : "border-slate-700 bg-slate-800 hover:bg-slate-700"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-xl font-bold">
                            Match {match.match_number}
                          </h3>

                          <p className="mt-1 text-sm text-slate-400">
                            {match.team_a || selectedSession.team_a_name} vs{" "}
                            {match.team_b || selectedSession.team_b_name}
                          </p>
                        </div>

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            match.match_status === "completed"
                              ? "bg-green-500/20 text-green-300"
                              : match.match_status === "live"
                                ? "bg-red-500/20 text-red-300"
                                : "bg-slate-700 text-slate-300"
                          }`}
                        >
                          {match.match_status === "completed"
                            ? "Completed"
                            : match.match_status === "live"
                              ? "Live"
                              : "Not Started"}
                        </span>
                      </div>

                      <p className="mt-4 text-lg font-bold">
                        {match.team_a_runs ?? 0}/{match.team_a_wickets ?? 0} vs{" "}
                        {match.team_b_runs ?? 0}/{match.team_b_wickets ?? 0}
                      </p>

                      {match.toss_winner && match.toss_decision && (
                        <p className="mt-2 text-xs text-slate-400">
                          Toss: {match.toss_winner} chose{" "}
                          {match.toss_decision === "bat" ? "to bat" : "to bowl"}
                        </p>
                      )}

                      {match.result_text && (
                        <p className="mt-2 text-sm font-semibold text-green-300">
                          🏆 {match.result_text}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            {showAddMatch && (
              <section className="mt-8 rounded-3xl border border-green-500/40 bg-slate-900 p-6">
                <h2 className="text-2xl font-bold">Add Match</h2>

                <p className="mt-2 text-slate-400">
                  Teams will be copied automatically from the selected session.
                  The toss will be completed before live scoring starts.
                </p>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm text-slate-300">
                      Match Number
                    </label>

                    <input
                      type="number"
                      min="1"
                      value={newMatchNumber}
                      onChange={(event) =>
                        setNewMatchNumber(event.target.value)
                      }
                      className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-slate-300">
                      Overs
                    </label>

                    <input
                      type="number"
                      min="1"
                      value={newMatchOvers}
                      onChange={(event) =>
                        setNewMatchOvers(event.target.value)
                      }
                      className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3"
                    />
                  </div>
                </div>

                <div className="mt-5 rounded-xl bg-slate-800 p-4">
                  <p className="text-sm text-slate-400">Teams</p>

                  <p className="mt-1 font-bold">
                    {selectedSession.team_a_name || "Team A"} vs{" "}
                    {selectedSession.team_b_name || "Team B"}
                  </p>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    onClick={createMatch}
                    disabled={creatingMatch}
                    className="rounded-xl bg-green-500 px-5 py-3 font-semibold text-slate-950 disabled:opacity-50"
                  >
                    {creatingMatch ? "Creating..." : "Create Match"}
                  </button>

                  <button
                    onClick={() => setShowAddMatch(false)}
                    disabled={creatingMatch}
                    className="rounded-xl border border-slate-600 px-5 py-3 text-slate-300"
                  >
                    Cancel
                  </button>
                </div>
              </section>
            )}

            {selectedMatch && (
              <LiveScorer
                key={selectedMatch.id}
                match={selectedMatch}
                teamAPlayers={teamAPlayers}
                teamBPlayers={teamBPlayers}
                teamAName={
                  selectedMatch.team_a ||
                  selectedSession.team_a_name ||
                  "Team A"
                }
                teamBName={
                  selectedMatch.team_b ||
                  selectedSession.team_b_name ||
                  "Team B"
                }
                isAdmin={isAdmin}
                onMatchUpdated={() => loadSessions(selectedSession.id)}
              />
            )}
          </>
        )}
      </div>
    </main>
  );
}

function TeamCard({
  title,
  captain,
  players,
}: {
  title: string;
  captain: string;
  players: Player[];
}) {
  return (
    <div className="rounded-3xl bg-slate-900 p-6">
      <h2 className="text-2xl font-bold">{title}</h2>

      <p className="mt-2 text-yellow-300">👑 Captain: {captain}</p>

      <div className="mt-5 space-y-2">
        {players.length === 0 && (
          <p className="text-slate-500">No team members assigned yet.</p>
        )}

        {players.map((player) => (
          <div
            key={player.id}
            className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-3"
          >
            {player.name}
          </div>
        ))}
      </div>
    </div>
  );
}