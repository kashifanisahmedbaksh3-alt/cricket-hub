"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import QuickScorer from "../sessions/[id]/components/QuickScorer";

/** Save as app/scorer/page.tsx. No changes to the existing Session Details page are needed. */

type SessionItem = {
  id: string;
  session_name: string | null;
  session_date: string;
};

type SessionDetails = {
  id: string;
  session_name: string | null;
  session_date: string;
  team_a_name: string | null;
  team_b_name: string | null;
  captain_a: string | null;
  captain_b: string | null;
  captain_a_player_id: string | null;
  captain_b_player_id: string | null;
};

type SessionPlayer = {
  player_id: string;
  players: { name: string } | null;
};

type TeamAssignment = {
  player_id: string;
  team_side: "A" | "B";
};

type Match = {
  id: string;
  match_number: number;
  team_a: string | null;
  team_b: string | null;
  team_a_runs: number | null;
  team_b_runs: number | null;
  overs: number | null;
  winner: string | null;
  match_status: string | null;
  batting_first_side: string | null;
  current_innings: number | null;
};

const ADMIN_EMAIL = "kashifanisahmedbaksh3@gmail.com";
const fieldClass = "w-full rounded-xl border border-slate-600 bg-slate-800 p-3 text-white outline-none focus:border-cyan-400";

function dateLabel(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC"
  });
}

export default function ScorerPage() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [details, setDetails] = useState<SessionDetails | null>(null);
  const [sessionPlayers, setSessionPlayers] = useState<SessionPlayer[]>([]);
  const [teamAssignments, setTeamAssignments] = useState<TeamAssignment[]>([]);
  const [teamNotice, setTeamNotice] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchId, setMatchId] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [creating, setCreating] = useState(false);
  const [checkingExisting, setCheckingExisting] = useState(false);
  const [existingLegacyScores, setExistingLegacyScores] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState("");
  const [overs, setOvers] = useState("7");
  const [captainA, setCaptainA] = useState("");
  const [captainB, setCaptainB] = useState("");
  const [manualCaptainA, setManualCaptainA] = useState("");
  const [manualCaptainB, setManualCaptainB] = useState("");

  useEffect(() => {
    let active = true;
    async function initialize() {
      const [authResult, sessionResult] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("sessions")
          .select("id,session_name,session_date")
          .order("session_date", { ascending: false })
          .limit(100),
      ]);
      if (!active) return;
      setIsAdmin(authResult.data.user?.email?.toLowerCase() === ADMIN_EMAIL);
      if (sessionResult.error) setError(sessionResult.error.message);
      else {
        const found = (sessionResult.data || []) as SessionItem[];
        setSessions(found);
        // Latest session date first: 25 October will appear automatically when it is the latest.
        if (found.length) setSessionId(found[0].id);
      }
      setLoadingSessions(false);
    }
    void initialize();
    return () => { active = false; };
  }, []);

  const loadSession = useCallback(async (id: string, preserveMatchId = "") => {
    // Background refreshes after a delivery must not unmount QuickScorer.
    // Unmounting resets the currently selected bowler after every ball.
    if (!preserveMatchId) setLoadingDetails(true);
    setError("");
    const [sessionResult, playersResult, matchesResult, teamsResult] = await Promise.all([
      supabase.from("sessions").select("id,session_name,session_date,team_a_name,team_b_name,captain_a,captain_b,captain_a_player_id,captain_b_player_id").eq("id", id).single(),
      supabase.from("session_players").select("player_id,players(name)").eq("session_id", id),
      supabase.from("matches").select("id,match_number,team_a,team_b,team_a_runs,team_b_runs,overs,winner,match_status,batting_first_side,current_innings").eq("session_id", id).order("match_number", { ascending: false }),
      supabase.from("session_team_players").select("player_id,team_side").eq("session_id", id),
    ]);
    const problem = sessionResult.error || playersResult.error || matchesResult.error;
    if (problem) {
      setError(problem.message);
      if (!preserveMatchId) setLoadingDetails(false);
      return;
    }
    const nextDetails = sessionResult.data as SessionDetails;
    const nextPlayers = (playersResult.data || []) as unknown as SessionPlayer[];
    const nextMatches = (matchesResult.data || []) as Match[];
    setDetails(nextDetails);
    setSessionPlayers(nextPlayers);
    // Team assignments are optional. The scorer still works without them.
    setTeamAssignments(teamsResult.error ? [] : (teamsResult.data || []) as TeamAssignment[]);
    setTeamNotice(teamsResult.error ? "Team assignments could not be loaded; all session players remain selectable." : "");
    setMatches(nextMatches);
    const preferred = nextMatches.find(m => m.id === preserveMatchId)
      || nextMatches.find(m => m.match_status === "in_progress")
      || nextMatches.find(m => m.match_status !== "completed")
      || nextMatches[0];
    setMatchId(preferred?.id || "");
    if (!preserveMatchId) {
      setShowCreate(nextMatches.length === 0);
      setOvers("7");
      setManualCaptainA("");
      setManualCaptainB("");
      const nameById = (pid: string | null) => nextPlayers.find(p => p.player_id === pid)?.players?.name || "";
      setCaptainA(nameById(nextDetails.captain_a_player_id) || nextDetails.captain_a || "");
      setCaptainB(nameById(nextDetails.captain_b_player_id) || nextDetails.captain_b || "");
    }
    if (!preserveMatchId) setLoadingDetails(false);
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    void loadSession(sessionId);
  }, [sessionId, loadSession]);

  // Protect older AI/manual scores from accidental replacement by a fresh ball log.
  useEffect(() => {
    const match = matches.find(m => m.id === matchId);
    if (!match || match.match_status === "completed" || (!Number(match.team_a_runs || 0) && !Number(match.team_b_runs || 0))) {
      setExistingLegacyScores(false);
      setCheckingExisting(false);
      return;
    }
    let active = true;
    setCheckingExisting(true);
    supabase.from("match_quick_balls")
      .select("id", { count: "exact", head: true })
      .eq("match_id", match.id)
      .then(({ count, error: countError }) => {
        if (!active) return;
        // An unreadable quick-ball log is not safe to overwrite.
        setExistingLegacyScores(Boolean(countError) || count === 0);
        setCheckingExisting(false);
      });
    return () => { active = false; };
  // Do not re-check after every ball: that would hide the scorer and clear selections.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  const selectedMatch = useMemo(() => matches.find(m => m.id === matchId) || null, [matches, matchId]);
  const players = useMemo(() => [...new Set(sessionPlayers.map(p => p.players?.name?.trim() || "").filter(Boolean))].sort(), [sessionPlayers]);
  const nextMatchNumber = useMemo(() => Math.max(0, ...matches.map(m => m.match_number)) + 1, [matches]);
  const teamRosters = useMemo(() => {
    const sideByPlayer = new Map(teamAssignments.map(a => [a.player_id, a.team_side]));
    const result: { A: string[]; B: string[]; unassigned: string[] } = { A: [], B: [], unassigned: [] };
    for (const p of sessionPlayers) {
      const name = p.players?.name?.trim();
      if (!name) continue;
      const side = sideByPlayer.get(p.player_id);
      if (side === "A" || side === "B") result[side].push(name);
      else result.unassigned.push(name);
    }
    result.A.sort(); result.B.sort(); result.unassigned.sort();
    return result;
  }, [teamAssignments, sessionPlayers]);
  const savedCaptainName = (side: "A" | "B") => {
    if (!details) return "Not selected";
    const id = side === "A" ? details.captain_a_player_id : details.captain_b_player_id;
    const saved = side === "A" ? details.captain_a : details.captain_b;
    return sessionPlayers.find(p => p.player_id === id)?.players?.name || saved || "Not selected";
  };

  async function createMatch() {
    if (!isAdmin || !sessionId || creating) return;
    const chosenOvers = Number(overs);
    if (!Number.isInteger(chosenOvers) || chosenOvers < 1 || chosenOvers > 50) {
      setError("Please enter a whole number of overs between 1 and 50.");
      return;
    }
    const firstCaptain = (captainA === "__manual__" ? manualCaptainA : captainA).trim();
    const secondCaptain = (captainB === "__manual__" ? manualCaptainB : captainB).trim();
    const teamAName = firstCaptain || details?.team_a_name || details?.captain_a || "Team A";
    const teamBName = secondCaptain || details?.team_b_name || details?.captain_b || "Team B";
    if (teamAName.toLowerCase() === teamBName.toLowerCase()) {
      setError("Team names must be different. Please select different captains.");
      return;
    }
    setCreating(true);
    setError("");
    const { data, error: insertError } = await supabase.from("matches").insert({
      session_id: sessionId,
      match_number: nextMatchNumber,
      team_a: teamAName,
      team_b: teamBName,
      overs: chosenOvers,
      match_status: "not_started",
    }).select("id").single();
    if (insertError || !data) {
      setError(insertError?.message || "Could not create the match.");
    } else {
      setShowCreate(false);
      await loadSession(sessionId, data.id);
    }
    setCreating(false);
  }

  return (
    <main className="min-h-screen bg-slate-950 px-3 py-5 text-white sm:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black">🏏 Quick Scorer</h1>
            <p className="mt-1 text-sm text-slate-400">Latest session opens automatically · Select any session by date.</p>
          </div>
          <a className="rounded-lg border border-slate-600 px-3 py-2 text-sm" href="/sessions">← Sessions</a>
        </div>

        {error && <p role="alert" className="mb-4 rounded-xl border border-red-700 bg-red-950 p-3 text-red-200">{error}</p>}

        <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold">
              1. Session
              <select className={`mt-2 ${fieldClass}`} value={sessionId} disabled={loadingSessions} onChange={e => { setDetails(null); setMatches([]); setMatchId(""); setSessionId(e.target.value); }}>
                {!sessions.length && <option value="">{loadingSessions ? "Loading sessions..." : "No sessions found"}</option>}
                {sessions.map((s, index) => <option key={s.id} value={s.id}>{dateLabel(s.session_date)} — {s.session_name || "Cricket"}{index === 0 ? " (Latest)" : ""}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold">
              2. Match
              <select className={`mt-2 ${fieldClass}`} value={matchId} disabled={loadingDetails || !matches.length} onChange={e => { setMatchId(e.target.value); setShowCreate(false); }}>
                {!matches.length && <option value="">No matches yet</option>}
                {matches.map(m => <option key={m.id} value={m.id}>Match {m.match_number} — {m.team_a || "Team A"} vs {m.team_b || "Team B"}{m.match_status === "completed" ? " ✓" : ""}</option>)}
              </select>
            </label>
          </div>
          {details && <p className="mt-3 text-sm text-slate-400">{dateLabel(details.session_date)} · {players.length} session players</p>}
          {isAdmin && details && <button type="button" className="mt-4 rounded-xl bg-green-500 px-5 py-3 font-bold text-slate-950" onClick={() => setShowCreate(v => !v)}>{showCreate ? "Cancel New Match" : `+ Start Match ${nextMatchNumber}`}</button>}
        </section>

        {details && !loadingDetails && (
          <details className="mt-4 rounded-2xl border border-slate-700 bg-slate-900 p-4">
            <summary className="cursor-pointer font-bold text-cyan-200">👥 Session teams and captains (tap to view)</summary>
            <p className="mt-2 text-sm text-slate-400">Team lists come from saved Session Team Setup. You can still score when teams are not yet assigned.</p>
            {teamNotice && <p className="mt-2 text-sm text-amber-300">{teamNotice}</p>}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {(["A", "B"] as const).map(side => (
                <div key={side} className="rounded-xl bg-slate-800 p-3">
                  <p className="font-bold">{(side === "A" ? details.team_a_name : details.team_b_name) || `Team ${side}`}</p>
                  <p className="mt-1 text-sm text-cyan-200">Captain: {savedCaptainName(side)}</p>
                  <p className="mt-2 text-sm text-slate-200">{teamRosters[side].length ? teamRosters[side].join(" · ") : "Players not assigned yet"}</p>
                </div>
              ))}
            </div>
            {teamRosters.unassigned.length > 0 && (
              <p className="mt-3 text-sm text-slate-300"><strong>Unassigned session players:</strong> {teamRosters.unassigned.join(" · ")}</p>
            )}
          </details>
        )}

        {showCreate && isAdmin && details && (
          <section className="mt-4 rounded-2xl border border-green-800 bg-slate-900 p-4 sm:p-5">
            <h2 className="text-xl font-bold">New Match {nextMatchNumber}</h2>
            <p className="mt-1 text-sm text-slate-400">Existing captains are preselected. Choose another session player or type a replacement captain's name.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {(["A", "B"] as const).map(side => {
                const selected = side === "A" ? captainA : captainB;
                const setter = side === "A" ? setCaptainA : setCaptainB;
                const manual = side === "A" ? manualCaptainA : manualCaptainB;
                const manualSetter = side === "A" ? setManualCaptainA : setManualCaptainB;
                return (
                  <div key={side}>
                    <label className="block text-sm font-semibold">Team {side} captain
                      <select className={`mt-2 ${fieldClass}`} value={selected} onChange={e => setter(e.target.value)}>
                        <option value="">Use saved team name</option>
                        {selected && selected !== "__manual__" && !players.includes(selected) && <option value={selected}>{selected} (saved captain)</option>}
                        {players.map(name => <option key={name} value={name}>{name}</option>)}
                        <option value="__manual__">✏️ Enter name manually</option>
                      </select>
                    </label>
                    {selected === "__manual__" && <input className={`mt-2 ${fieldClass}`} value={manual} onChange={e => manualSetter(e.target.value)} placeholder="Replacement captain name" />}
                  </div>
                );
              })}
              <label className="block text-sm font-semibold">Overs per innings
                <input className={`mt-2 ${fieldClass}`} type="number" min="1" max="50" value={overs} onChange={e => setOvers(e.target.value)} />
              </label>
            </div>
            <button type="button" disabled={creating} onClick={createMatch} className="mt-4 rounded-xl bg-cyan-500 px-5 py-3 font-black text-slate-950 disabled:opacity-50">{creating ? "Creating..." : `Create Match ${nextMatchNumber} & Open Scorer`}</button>
          </section>
        )}

        {loadingDetails && <p className="mt-6 text-slate-300">Loading session and matches...</p>}
        {!loadingDetails && details && !showCreate && selectedMatch && (
          <>
            {checkingExisting && <p className="mt-4 text-slate-300">Checking this match's saved deliveries...</p>}
            {!checkingExisting && existingLegacyScores && <p className="mt-4 rounded-xl border border-amber-800 bg-amber-950 p-3 text-sm text-amber-200">This match already has scores, but no saved Quick Scorer deliveries. To protect those scores, open a new match instead of scoring this one again.</p>}
            {!checkingExisting && !existingLegacyScores && <QuickScorer
              key={selectedMatch.id}
              match={selectedMatch}
              sessionPlayers={sessionPlayers}
              teamAssignments={teamAssignments}
              captainA={selectedMatch.team_a || details.captain_a}
              captainB={selectedMatch.team_b || details.captain_b}
              onChanged={() => loadSession(sessionId, selectedMatch.id)}
            />}
          </>
        )}
        {!loadingDetails && details && !matches.length && !showCreate && <p className="mt-5 text-slate-300">No matches in this session yet. Select “Start Match 1” above.</p>}
        {!isAdmin && !loadingSessions && <p className="mt-4 text-sm text-amber-300">Sign in with your admin account to enter scores.</p>}
      </div>
    </main>
  );
}
