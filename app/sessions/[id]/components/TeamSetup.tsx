"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../../lib/supabase";

type Player = {
  id: string;
  name: string;
};

type SessionPlayer = {
  player_id: string;
  players: Player | null;
};

type TeamSide = "A" | "B" | "";

type TeamSetupProps = {
  sessionId: string;
  sessionPlayers: SessionPlayer[];
  initialCaptainAId?: string | null;
  initialCaptainBId?: string | null;
  initialTeamAName?: string | null;
  initialTeamBName?: string | null;
  onSaved?: () => void | Promise<void>;
};

const ADMIN_EMAIL = "kashifanisahmedbaksh3@gmail.com";

export default function TeamSetup({
  sessionId,
  sessionPlayers,
  initialCaptainAId,
  initialCaptainBId,
  initialTeamAName,
  initialTeamBName,
  onSaved,
}: TeamSetupProps) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [captainAId, setCaptainAId] = useState(initialCaptainAId || "");
  const [captainBId, setCaptainBId] = useState(initialCaptainBId || "");
  const [teamAName, setTeamAName] = useState(initialTeamAName || "");
  const [teamBName, setTeamBName] = useState(initialTeamBName || "");

  const [assignments, setAssignments] = useState<
    Record<string, TeamSide>
  >({});

  const players = useMemo(
    () =>
      sessionPlayers
        .filter((row) => row.players)
        .map((row) => ({
          id: row.player_id,
          name: row.players?.name || "Unknown Player",
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [sessionPlayers]
  );

  const teamAPlayers = useMemo(
    () => players.filter((player) => assignments[player.id] === "A"),
    [players, assignments]
  );

  const teamBPlayers = useMemo(
    () => players.filter((player) => assignments[player.id] === "B"),
    [players, assignments]
  );

  const unassignedPlayers = useMemo(
    () => players.filter((player) => !assignments[player.id]),
    [players, assignments]
  );

  async function loadAdminStatus() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    setIsAdmin(user?.email?.toLowerCase() === ADMIN_EMAIL);
  }

  async function loadSavedTeams() {
    setLoading(true);

    const { data, error } = await supabase
      .from("session_team_players")
      .select("player_id, team_side")
      .eq("session_id", sessionId);

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    const savedAssignments: Record<string, TeamSide> = {};

    for (const row of data || []) {
      savedAssignments[row.player_id] = row.team_side as "A" | "B";
    }

    setAssignments(savedAssignments);
    setLoading(false);
  }

  useEffect(() => {
    loadAdminStatus();
    loadSavedTeams();
  }, [sessionId]);

  useEffect(() => {
    setCaptainAId(initialCaptainAId || "");
    setCaptainBId(initialCaptainBId || "");
    setTeamAName(initialTeamAName || "");
    setTeamBName(initialTeamBName || "");
  }, [
    initialCaptainAId,
    initialCaptainBId,
    initialTeamAName,
    initialTeamBName,
  ]);

  function getPlayerName(playerId: string) {
    return players.find((player) => player.id === playerId)?.name || "";
  }

  function handleCaptainAChange(playerId: string) {
    setCaptainAId(playerId);

    const captainName = getPlayerName(playerId);

    if (captainName) {
      setTeamAName(`Team ${captainName}`);
      setAssignments((current) => ({
        ...current,
        [playerId]: "A",
      }));
    }
  }

  function handleCaptainBChange(playerId: string) {
    setCaptainBId(playerId);

    const captainName = getPlayerName(playerId);

    if (captainName) {
      setTeamBName(`Team ${captainName}`);
      setAssignments((current) => ({
        ...current,
        [playerId]: "B",
      }));
    }
  }

  function changePlayerTeam(playerId: string, teamSide: TeamSide) {
    setAssignments((current) => ({
      ...current,
      [playerId]: teamSide,
    }));
  }

  async function saveTeams() {
    if (!isAdmin) {
      alert("Please log in as admin to save teams.");
      return;
    }

    if (!captainAId || !captainBId) {
      alert("Please select both captains.");
      return;
    }

    if (captainAId === captainBId) {
      alert("Captain A and Captain B must be different players.");
      return;
    }

    if (!teamAName.trim() || !teamBName.trim()) {
      alert("Please enter both team names.");
      return;
    }

    const assignedPlayers = players.filter(
      (player) =>
        assignments[player.id] === "A" ||
        assignments[player.id] === "B"
    );

    if (assignedPlayers.length > 0) {
      const hasTeamA = assignedPlayers.some(
        (player) => assignments[player.id] === "A"
      );

      const hasTeamB = assignedPlayers.some(
        (player) => assignments[player.id] === "B"
      );

      if (!hasTeamA || !hasTeamB) {
        alert("Both teams must have at least one assigned player.");
        return;
      }
    }

    setSaving(true);

    const { error: sessionError } = await supabase
      .from("sessions")
      .update({
        captain_a_player_id: captainAId,
        captain_b_player_id: captainBId,
        captain_a: getPlayerName(captainAId),
        captain_b: getPlayerName(captainBId),
        team_a_name: teamAName.trim(),
        team_b_name: teamBName.trim(),
      })
      .eq("id", sessionId);

    if (sessionError) {
      setSaving(false);
      alert(sessionError.message);
      return;
    }

    const { error: deleteError } = await supabase
      .from("session_team_players")
      .delete()
      .eq("session_id", sessionId);

    if (deleteError) {
      setSaving(false);
      alert(deleteError.message);
      return;
    }

    const rowsToInsert = assignedPlayers.map((player) => ({
      session_id: sessionId,
      player_id: player.id,
      team_side: assignments[player.id],
    }));

    if (rowsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from("session_team_players")
        .insert(rowsToInsert);

      if (insertError) {
        setSaving(false);
        alert(insertError.message);
        return;
      }
    }

    /*
      Update matches that have not started yet so every new/pending match
      uses the saved session team names automatically.
      Completed matches are not touched.
    */
    const { error: matchError } = await supabase
      .from("matches")
      .update({
        team_a: teamAName.trim(),
        team_b: teamBName.trim(),
      })
      .eq("session_id", sessionId)
      .or("match_status.is.null,match_status.eq.not_started");

    setSaving(false);

    if (matchError) {
      alert(
        `Teams were saved, but pending matches could not be updated: ${matchError.message}`
      );
    } else {
      alert("Session captains and teams saved successfully.");
    }

    await loadSavedTeams();
    await onSaved?.();
  }

  if (loading) {
    return (
      <section className="mt-8 rounded-2xl bg-slate-900 p-6">
        <p className="text-slate-400">Loading session teams...</p>
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-2xl bg-slate-900 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">👑 Session Team Setup</h2>

          <p className="mt-1 text-sm text-slate-400">
            Select captains in advance. Assign players now or complete the teams
            later at the turf.
          </p>
        </div>

        <div
          className={`rounded-xl px-3 py-2 text-sm font-semibold ${
            isAdmin
              ? "bg-green-500/20 text-green-300"
              : "bg-yellow-500/20 text-yellow-300"
          }`}
        >
          {isAdmin ? "Admin editing enabled" : "Public view-only"}
        </div>
      </div>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
          <h3 className="text-xl font-bold">Team A</h3>

          <label className="mt-4 block text-sm text-slate-300">
            Captain A
          </label>

          <select
            value={captainAId}
            onChange={(event) => handleCaptainAChange(event.target.value)}
            disabled={!isAdmin}
            className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-900 p-3 disabled:opacity-60"
          >
            <option value="">Select Captain A</option>

            {players
              .filter((player) => player.id !== captainBId)
              .map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name}
                </option>
              ))}
          </select>

          <label className="mt-4 block text-sm text-slate-300">
            Team A Name
          </label>

          <input
            value={teamAName}
            onChange={(event) => setTeamAName(event.target.value)}
            disabled={!isAdmin}
            placeholder="Example: Team Hasnain"
            className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-900 p-3 disabled:opacity-60"
          />

          <div className="mt-5">
            <p className="text-sm text-slate-400">
              Players: {teamAPlayers.length}
            </p>

            <div className="mt-3 space-y-2">
              {teamAPlayers.length === 0 && (
                <p className="text-sm text-slate-500">
                  No players assigned yet.
                </p>
              )}

              {teamAPlayers.map((player) => (
                <div
                  key={player.id}
                  className="rounded-lg bg-slate-900 px-3 py-2"
                >
                  {player.name}
                  {player.id === captainAId ? " 👑" : ""}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
          <h3 className="text-xl font-bold">Team B</h3>

          <label className="mt-4 block text-sm text-slate-300">
            Captain B
          </label>

          <select
            value={captainBId}
            onChange={(event) => handleCaptainBChange(event.target.value)}
            disabled={!isAdmin}
            className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-900 p-3 disabled:opacity-60"
          >
            <option value="">Select Captain B</option>

            {players
              .filter((player) => player.id !== captainAId)
              .map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name}
                </option>
              ))}
          </select>

          <label className="mt-4 block text-sm text-slate-300">
            Team B Name
          </label>

          <input
            value={teamBName}
            onChange={(event) => setTeamBName(event.target.value)}
            disabled={!isAdmin}
            placeholder="Example: Team Shaizer"
            className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-900 p-3 disabled:opacity-60"
          />

          <div className="mt-5">
            <p className="text-sm text-slate-400">
              Players: {teamBPlayers.length}
            </p>

            <div className="mt-3 space-y-2">
              {teamBPlayers.length === 0 && (
                <p className="text-sm text-slate-500">
                  No players assigned yet.
                </p>
              )}

              {teamBPlayers.map((player) => (
                <div
                  key={player.id}
                  className="rounded-lg bg-slate-900 px-3 py-2"
                >
                  {player.name}
                  {player.id === captainBId ? " 👑" : ""}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-700 bg-slate-800 p-5">
        <h3 className="text-lg font-bold">Assign Team Members</h3>

        <p className="mt-1 text-sm text-slate-400">
          This is optional. Leave players unassigned now and complete it later
          at the turf.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {players.map((player) => (
            <div
              key={player.id}
              className="rounded-xl border border-slate-700 bg-slate-900 p-4"
            >
              <p className="font-semibold">
                {player.name}
                {player.id === captainAId || player.id === captainBId
                  ? " 👑"
                  : ""}
              </p>

              <select
                value={assignments[player.id] || ""}
                onChange={(event) =>
                  changePlayerTeam(
                    player.id,
                    event.target.value as TeamSide
                  )
                }
                disabled={
                  !isAdmin ||
                  player.id === captainAId ||
                  player.id === captainBId
                }
                className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-800 p-2 disabled:opacity-60"
              >
                <option value="">Unassigned / Decide Later</option>
                <option value="A">{teamAName || "Team A"}</option>
                <option value="B">{teamBName || "Team B"}</option>
              </select>
            </div>
          ))}
        </div>

        {unassignedPlayers.length > 0 && (
          <p className="mt-4 text-sm text-yellow-300">
            {unassignedPlayers.length} player
            {unassignedPlayers.length === 1 ? "" : "s"} still unassigned.
          </p>
        )}
      </div>

      {isAdmin && (
        <button
          onClick={saveTeams}
          disabled={saving}
          className="mt-6 rounded-xl bg-green-500 px-6 py-3 font-semibold text-slate-950 disabled:opacity-50"
        >
          {saving ? "Saving Teams..." : "Save Session Teams"}
        </button>
      )}
    </section>
  );
}