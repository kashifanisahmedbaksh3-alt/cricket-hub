"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type Player = {
  id: string;
  name: string;
};

type SessionPlayerRow = {
  player_id: string;
  players: Player | null;
};

type MatchPlayer = {
  id: string;
  match_id: string;
  player_id: string;
  team_side: "A" | "B";
  batting_position: number | null;
  is_captain: boolean;
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
  match_status: string | null;
  current_innings: number | null;
  target_runs: number | null;
  batting_first_team: string | null;
  result_text: string | null;
  striker_id: string | null;
  non_striker_id: string | null;
  bowler_id: string | null;
};

type Session = {
  id: string;
  session_name: string;
  session_date: string;
  turfs: { name: string } | null;
  session_players: SessionPlayerRow[];
  matches: Match[];
};

type BallEvent = {
  id: string;
  match_id: string;
  innings_number: number;
  event_number: number;
  runs_bat: number;
  extras: number;
  extra_type: "wide" | "no_ball" | "bye" | "leg_bye" | null;
  is_legal_ball: boolean;
  is_wicket: boolean;
  wicket_type: string | null;
  description: string | null;
  striker_id: string | null;
  non_striker_id: string | null;
  bowler_id: string | null;
  dismissed_player_id: string | null;
  fielder_id: string | null;
  created_at: string;
};

type ExtraType = "wide" | "no_ball" | "bye" | "leg_bye";

type InningsScore = {
  runs: number;
  wickets: number;
  legalBalls: number;
  oversDisplay: string;
  runRate: number;
};

type BattingStat = {
  playerId: string;
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: number;
  out: boolean;
};

type BowlingStat = {
  playerId: string;
  name: string;
  legalBalls: number;
  runs: number;
  wickets: number;
  overs: string;
  economy: number;
};

const ADMIN_EMAIL = "kashifanisahmedbaksh3@gmail.com";

function calculateInningsScore(events: BallEvent[]): InningsScore {
  const runs = events.reduce(
    (sum, event) => sum + Number(event.runs_bat || 0) + Number(event.extras || 0),
    0
  );
  const wickets = events.filter((event) => event.is_wicket).length;
  const legalBalls = events.filter((event) => event.is_legal_ball).length;
  const completedOvers = Math.floor(legalBalls / 6);
  const ballsInOver = legalBalls % 6;

  return {
    runs,
    wickets,
    legalBalls,
    oversDisplay: `${completedOvers}.${ballsInOver}`,
    runRate: legalBalls > 0 ? runs / (legalBalls / 6) : 0,
  };
}

function oversFromBalls(legalBalls: number) {
  return `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`;
}

export default function AiUmpirePage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [selectedMatchId, setSelectedMatchId] = useState("");
  const [inningsNumber, setInningsNumber] = useState(1);
  const [events, setEvents] = useState<BallEvent[]>([]);
  const [matchPlayers, setMatchPlayers] = useState<MatchPlayer[]>([]);
  const [teamAssignments, setTeamAssignments] = useState<Record<string, "A" | "B" | "">>({});
  const [strikerId, setStrikerId] = useState("");
  const [nonStrikerId, setNonStrikerId] = useState("");
  const [bowlerId, setBowlerId] = useState("");
  const [fielderId, setFielderId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingTeams, setSavingTeams] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [wicketType, setWicketType] = useState("bowled");

  async function loadAdminStatus() {
    const { data: { user } } = await supabase.auth.getUser();
    setIsAdmin(user?.email?.toLowerCase() === ADMIN_EMAIL);
  }

  async function loadSessions() {
    setLoading(true);

    const { data, error } = await supabase
      .from("sessions")
      .select(`
        id,
        session_name,
        session_date,
        turfs (name),
        session_players (
          player_id,
          players (id, name)
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
          match_status,
          current_innings,
          target_runs,
          batting_first_team,
          result_text,
          striker_id,
          non_striker_id,
          bowler_id
        )
      `)
      .order("session_date", { ascending: false });

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    const loadedSessions = (data || []) as unknown as Session[];
    setSessions(loadedSessions);

    if (loadedSessions.length > 0 && !selectedSessionId) {
      const firstSession = loadedSessions[0];
      setSelectedSessionId(firstSession.id);
      const firstMatch = [...(firstSession.matches || [])].sort(
        (a, b) => a.match_number - b.match_number
      )[0];

      if (firstMatch) {
        setSelectedMatchId(firstMatch.id);
        setInningsNumber(firstMatch.current_innings || 1);
        setStrikerId(firstMatch.striker_id || "");
        setNonStrikerId(firstMatch.non_striker_id || "");
        setBowlerId(firstMatch.bowler_id || "");
      }
    }

    setLoading(false);
  }

  async function loadBallEvents(matchId: string, innings: number) {
    if (!matchId) {
      setEvents([]);
      return;
    }

    const { data, error } = await supabase
      .from("ball_events")
      .select("*")
      .eq("match_id", matchId)
      .eq("innings_number", innings)
      .order("event_number", { ascending: true });

    if (error) {
      alert(error.message);
      return;
    }

    setEvents((data || []) as BallEvent[]);
  }

  async function loadMatchPlayers(matchId: string) {
    if (!matchId) {
      setMatchPlayers([]);
      setTeamAssignments({});
      return;
    }

    const { data, error } = await supabase
      .from("match_players")
      .select(`
        id,
        match_id,
        player_id,
        team_side,
        batting_position,
        is_captain,
        players (id, name)
      `)
      .eq("match_id", matchId)
      .order("team_side", { ascending: true })
      .order("batting_position", { ascending: true });

    if (error) {
      alert(error.message);
      return;
    }

    const rows = (data || []) as unknown as MatchPlayer[];
    setMatchPlayers(rows);
    setTeamAssignments(
      rows.reduce<Record<string, "A" | "B" | "">>((acc, row) => {
        acc[row.player_id] = row.team_side;
        return acc;
      }, {})
    );
  }

  useEffect(() => {
    loadAdminStatus();
    loadSessions();
  }, []);

  useEffect(() => {
    loadBallEvents(selectedMatchId, inningsNumber);
    loadMatchPlayers(selectedMatchId);
  }, [selectedMatchId, inningsNumber]);

  const selectedSession = sessions.find((session) => session.id === selectedSessionId);
  const sessionMatches = useMemo(
    () => [...(selectedSession?.matches || [])].sort((a, b) => a.match_number - b.match_number),
    [selectedSession]
  );
  const selectedMatch = sessionMatches.find((match) => match.id === selectedMatchId);
  const score = useMemo(() => calculateInningsScore(events), [events]);

  const playerMap = useMemo(() => {
    const map = new Map<string, string>();
    selectedSession?.session_players?.forEach((row) => {
      if (row.players) map.set(row.players.id, row.players.name);
    });
    matchPlayers.forEach((row) => {
      if (row.players) map.set(row.players.id, row.players.name);
    });
    return map;
  }, [selectedSession, matchPlayers]);

  const teamAPlayers = useMemo(
    () => matchPlayers.filter((row) => row.team_side === "A"),
    [matchPlayers]
  );
  const teamBPlayers = useMemo(
    () => matchPlayers.filter((row) => row.team_side === "B"),
    [matchPlayers]
  );

  const battingSide: "A" | "B" = inningsNumber === 1 ? "A" : "B";
  const bowlingSide: "A" | "B" = inningsNumber === 1 ? "B" : "A";
  const battingPlayers = battingSide === "A" ? teamAPlayers : teamBPlayers;
  const bowlingPlayers = bowlingSide === "A" ? teamAPlayers : teamBPlayers;

  const chaseSummary = useMemo(() => {
    if (inningsNumber !== 2 || !selectedMatch?.target_runs || selectedMatch.target_runs <= 0) {
      return null;
    }
    const target = Number(selectedMatch.target_runs);
    const requiredRuns = Math.max(target - score.runs, 0);
    const totalBalls = Number(selectedMatch.overs || 7) * 6;
    const remainingBalls = Math.max(totalBalls - score.legalBalls, 0);
    const requiredRunRate = remainingBalls > 0 ? requiredRuns / (remainingBalls / 6) : 0;
    return { target, requiredRuns, remainingBalls, requiredRunRate };
  }, [inningsNumber, selectedMatch, score]);

  const lastBalls = useMemo(() => events.slice(-6).map(getEventLabel), [events]);

  const battingStats = useMemo(() => {
    const stats = new Map<string, BattingStat>();

    for (const event of events) {
      if (!event.striker_id) continue;
      const current = stats.get(event.striker_id) || {
        playerId: event.striker_id,
        name: playerMap.get(event.striker_id) || "Unknown",
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        strikeRate: 0,
        out: false,
      };

      current.runs += Number(event.runs_bat || 0);
      if (event.is_legal_ball && event.extra_type !== "wide") current.balls += 1;
      if (event.runs_bat === 4) current.fours += 1;
      if (event.runs_bat === 6) current.sixes += 1;
      if (event.dismissed_player_id === event.striker_id) current.out = true;
      current.strikeRate = current.balls > 0 ? (current.runs / current.balls) * 100 : 0;
      stats.set(event.striker_id, current);
    }

    return [...stats.values()].sort((a, b) => b.runs - a.runs);
  }, [events, playerMap]);

  const bowlingStats = useMemo(() => {
    const stats = new Map<string, BowlingStat>();

    for (const event of events) {
      if (!event.bowler_id) continue;
      const current = stats.get(event.bowler_id) || {
        playerId: event.bowler_id,
        name: playerMap.get(event.bowler_id) || "Unknown",
        legalBalls: 0,
        runs: 0,
        wickets: 0,
        overs: "0.0",
        economy: 0,
      };

      if (event.is_legal_ball) current.legalBalls += 1;
      current.runs += Number(event.runs_bat || 0);
      if (["wide", "no_ball"].includes(event.extra_type || "")) {
        current.runs += Number(event.extras || 0);
      }
      if (event.is_wicket && !["run_out", "retired_out"].includes(event.wicket_type || "")) {
        current.wickets += 1;
      }
      current.overs = oversFromBalls(current.legalBalls);
      current.economy = current.legalBalls > 0 ? current.runs / (current.legalBalls / 6) : 0;
      stats.set(event.bowler_id, current);
    }

    return [...stats.values()].sort((a, b) => b.wickets - a.wickets || a.runs - b.runs);
  }, [events, playerMap]);

  function handleSessionChange(sessionId: string) {
    setSelectedSessionId(sessionId);
    setEvents([]);
    setMatchPlayers([]);
    setTeamAssignments({});

    const session = sessions.find((item) => item.id === sessionId);
    const matches = [...(session?.matches || [])].sort((a, b) => a.match_number - b.match_number);

    if (matches.length > 0) {
      const match = matches[0];
      setSelectedMatchId(match.id);
      setInningsNumber(match.current_innings || 1);
      setStrikerId(match.striker_id || "");
      setNonStrikerId(match.non_striker_id || "");
      setBowlerId(match.bowler_id || "");
    } else {
      setSelectedMatchId("");
    }
  }

  function handleMatchChange(matchId: string) {
    setSelectedMatchId(matchId);
    const match = sessionMatches.find((item) => item.id === matchId);
    setInningsNumber(match?.current_innings || 1);
    setStrikerId(match?.striker_id || "");
    setNonStrikerId(match?.non_striker_id || "");
    setBowlerId(match?.bowler_id || "");
    setFielderId("");
  }

  async function saveTeamAssignments() {
    if (!isAdmin || !selectedMatchId || !selectedSession) return;
    const assignedRows = selectedSession.session_players
      .map((row) => ({ player_id: row.player_id, side: teamAssignments[row.player_id] }))
      .filter((row) => row.side === "A" || row.side === "B");

    if (assignedRows.length < 2) {
      alert("Assign at least one player to each team.");
      return;
    }
    if (!assignedRows.some((row) => row.side === "A") || !assignedRows.some((row) => row.side === "B")) {
      alert("Both Team A and Team B need players.");
      return;
    }

    setSavingTeams(true);
    const { error: deleteError } = await supabase
      .from("match_players")
      .delete()
      .eq("match_id", selectedMatchId);

    if (deleteError) {
      setSavingTeams(false);
      alert(deleteError.message);
      return;
    }

    const rows = assignedRows.map((row, index) => ({
      match_id: selectedMatchId,
      player_id: row.player_id,
      team_side: row.side,
      batting_position: index + 1,
      is_captain: false,
    }));

    const { error } = await supabase.from("match_players").insert(rows);
    setSavingTeams(false);

    if (error) {
      alert(error.message);
      return;
    }

    await loadMatchPlayers(selectedMatchId);
    alert("Teams saved for this match.");
  }

  async function saveCurrentPlayers(nextStriker = strikerId, nextNonStriker = nonStrikerId, nextBowler = bowlerId) {
    if (!selectedMatchId) return;
    await supabase
      .from("matches")
      .update({
        striker_id: nextStriker || null,
        non_striker_id: nextNonStriker || null,
        bowler_id: nextBowler || null,
      })
      .eq("id", selectedMatchId);
  }

  async function swapStrike() {
    const nextStriker = nonStrikerId;
    const nextNonStriker = strikerId;
    setStrikerId(nextStriker);
    setNonStrikerId(nextNonStriker);
    await saveCurrentPlayers(nextStriker, nextNonStriker, bowlerId);
  }

  async function addBallEvent({
    runsBat = 0,
    extras = 0,
    extraType = null,
    isLegalBall = true,
    isWicket = false,
    selectedWicketType = null,
    description = null,
  }: {
    runsBat?: number;
    extras?: number;
    extraType?: ExtraType | null;
    isLegalBall?: boolean;
    isWicket?: boolean;
    selectedWicketType?: string | null;
    description?: string | null;
  }) {
    if (!isAdmin) {
      alert("Please log in as admin to score the match.");
      return;
    }
    if (!selectedMatchId) {
      alert("Please select a match.");
      return;
    }
    if (!strikerId || !nonStrikerId || !bowlerId) {
      alert("Select striker, non-striker and bowler first.");
      return;
    }
    if (strikerId === nonStrikerId) {
      alert("Striker and non-striker must be different players.");
      return;
    }
    if (selectedMatch?.match_status === "completed") {
      alert("This match has already been completed.");
      return;
    }

    setSaving(true);
    const nextEventNumber = events.length > 0
      ? Math.max(...events.map((event) => event.event_number)) + 1
      : 1;

    const dismissedPlayerId = isWicket ? strikerId : null;
    const { error } = await supabase.from("ball_events").insert({
      match_id: selectedMatchId,
      innings_number: inningsNumber,
      event_number: nextEventNumber,
      runs_bat: runsBat,
      extras,
      extra_type: extraType,
      is_legal_ball: isLegalBall,
      is_wicket: isWicket,
      wicket_type: selectedWicketType,
      description,
      striker_id: strikerId,
      non_striker_id: nonStrikerId,
      bowler_id: bowlerId,
      dismissed_player_id: dismissedPlayerId,
      fielder_id: fielderId || null,
    });

    if (error) {
      setSaving(false);
      alert(error.message);
      return;
    }

    await supabase
      .from("matches")
      .update({ match_status: "live", current_innings: inningsNumber })
      .eq("id", selectedMatchId);

    const legalBallCountAfter = score.legalBalls + (isLegalBall ? 1 : 0);
    const totalCompletedRuns = runsBat + extras;
    const inningsRunsAfter = score.runs + totalCompletedRuns;

    // In a chase, finish the match immediately when the target is reached or passed.
    if (
      inningsNumber === 2 &&
      selectedMatch?.target_runs &&
      inningsRunsAfter >= Number(selectedMatch.target_runs)
    ) {
      await loadBallEvents(selectedMatchId, inningsNumber);
      await finishMatch(true);
      setSaving(false);
      return;
    }

    let nextStriker = strikerId;
    let nextNonStriker = nonStrikerId;

    if (totalCompletedRuns % 2 === 1) {
      [nextStriker, nextNonStriker] = [nextNonStriker, nextStriker];
    }

    const overCompleted = isLegalBall && legalBallCountAfter % 6 === 0;

    if (overCompleted) {
      [nextStriker, nextNonStriker] = [nextNonStriker, nextStriker];
    }

    if (isWicket) {
      nextStriker = "";
    }

    const nextBowler = overCompleted ? "" : bowlerId;

    setStrikerId(nextStriker);
    setNonStrikerId(nextNonStriker);
    setBowlerId(nextBowler);
    await saveCurrentPlayers(nextStriker, nextNonStriker, nextBowler);
    await loadBallEvents(selectedMatchId, inningsNumber);
    setSaving(false);

    if (overCompleted) {
      alert("🏏 Over completed.\n\nPlease select the bowler for the next over.");
    }
  }

  async function addWide() {
    await addBallEvent({ extras: 1, extraType: "wide", isLegalBall: false, description: "Wide" });
  }

  async function addNoBall() {
    await addBallEvent({ extras: 1, extraType: "no_ball", isLegalBall: false, description: "No-ball" });
  }

  async function addBye(runs: number) {
    await addBallEvent({ extras: runs, extraType: "bye", isLegalBall: true, description: `${runs} bye${runs === 1 ? "" : "s"}` });
  }

  async function addLegBye(runs: number) {
    await addBallEvent({ extras: runs, extraType: "leg_bye", isLegalBall: true, description: `${runs} leg bye${runs === 1 ? "" : "s"}` });
  }

  async function addWicket() {
    await addBallEvent({
      isLegalBall: wicketType !== "run_out",
      isWicket: true,
      selectedWicketType: wicketType,
      description: wicketType.replaceAll("_", " "),
    });
  }

  async function undoLastBall() {
    if (!isAdmin || events.length === 0) return;
    const lastEvent = events[events.length - 1];
    if (!confirm(`Undo last event: ${getEventLabel(lastEvent)}?`)) return;

    const { error } = await supabase.from("ball_events").delete().eq("id", lastEvent.id);
    if (error) {
      alert(error.message);
      return;
    }

    setStrikerId(lastEvent.striker_id || "");
    setNonStrikerId(lastEvent.non_striker_id || "");
    setBowlerId(lastEvent.bowler_id || "");
    await saveCurrentPlayers(lastEvent.striker_id || "", lastEvent.non_striker_id || "", lastEvent.bowler_id || "");
    await loadBallEvents(selectedMatchId, inningsNumber);
  }

  async function startSecondInnings() {
    if (!isAdmin || !selectedMatchId || !selectedMatch || inningsNumber !== 1 || events.length === 0) return;
    const target = score.runs + 1;
    if (!confirm(`End first innings at ${score.runs}/${score.wickets} and set target to ${target}?`)) return;

    const { error } = await supabase
      .from("matches")
      .update({
        current_innings: 2,
        target_runs: target,
        match_status: "live",
        batting_first_team: selectedMatch.team_a,
        team_a_runs: score.runs,
        team_a_wickets: score.wickets,
        striker_id: null,
        non_striker_id: null,
        bowler_id: null,
      })
      .eq("id", selectedMatchId);

    if (error) {
      alert(error.message);
      return;
    }

    setInningsNumber(2);
    setEvents([]);
    setStrikerId("");
    setNonStrikerId("");
    setBowlerId("");
    setFielderId("");
    await loadSessions();
    await loadBallEvents(selectedMatchId, 2);
  }

  async function finishMatch(automatic = false) {
    if (!isAdmin || !selectedMatchId || !selectedMatch || inningsNumber !== 2) return;

    if (selectedMatch.match_status === "completed") return;

    if (
      !automatic &&
      !confirm(`Finish match with second-innings score ${score.runs}/${score.wickets}?`)
    ) {
      return;
    }

    setSaving(true);

    const { data: allEvents, error: eventError } = await supabase
      .from("ball_events")
      .select("*")
      .eq("match_id", selectedMatchId)
      .order("innings_number", { ascending: true })
      .order("event_number", { ascending: true });

    if (eventError) {
      setSaving(false);
      alert(eventError.message);
      return;
    }

    const matchEvents = (allEvents || []) as BallEvent[];
    const firstScore = calculateInningsScore(matchEvents.filter((event) => event.innings_number === 1));
    const secondScore = calculateInningsScore(matchEvents.filter((event) => event.innings_number === 2));
    const teamA = selectedMatch.team_a || "Team A";
    const teamB = selectedMatch.team_b || "Team B";

    let winner = "Tie";
    let resultText = "Match tied";
    if (secondScore.runs > firstScore.runs) {
      const wicketsRemaining = Math.max(10 - secondScore.wickets, 0);
      winner = teamB;
      resultText = `${teamB} won by ${wicketsRemaining} wicket${wicketsRemaining === 1 ? "" : "s"}`;
    } else if (secondScore.runs < firstScore.runs) {
      const margin = firstScore.runs - secondScore.runs;
      winner = teamA;
      resultText = `${teamA} won by ${margin} run${margin === 1 ? "" : "s"}`;
    }

    const { error } = await supabase
      .from("matches")
      .update({
        team_a_runs: firstScore.runs,
        team_a_wickets: firstScore.wickets,
        team_b_runs: secondScore.runs,
        team_b_wickets: secondScore.wickets,
        winner,
        result_text: resultText,
        current_innings: 2,
        match_status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", selectedMatchId);

    setSaving(false);
    if (error) {
      alert(error.message);
      return;
    }

    alert(
      `${automatic ? "🏆 Target reached — match completed automatically!" : "Match completed!"}` +
      `\n\n${teamA}: ${firstScore.runs}/${firstScore.wickets}` +
      `\n${teamB}: ${secondScore.runs}/${secondScore.wickets}` +
      `\n\n${resultText}`
    );
    await loadSessions();
    await loadBallEvents(selectedMatchId, 2);
  }

  if (loading) {
    return <main className="min-h-screen bg-slate-950 p-6 text-white">Loading AI Match Centre...</main>;
  }

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-white md:p-6">
      <div className="mx-auto max-w-7xl">
        <Link href="/" className="text-sm text-slate-400">← Back to Dashboard</Link>

        <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-4xl font-bold">🤖 AI Match Centre</h1>
            <p className="mt-2 text-slate-300">Live scoring with striker, bowler and automatic player statistics.</p>
          </div>
          <div className={`rounded-xl px-4 py-2 text-sm font-semibold ${isAdmin ? "bg-green-500/20 text-green-300" : "bg-yellow-500/20 text-yellow-300"}`}>
            {isAdmin ? "👑 Admin scoring enabled" : "👀 Public view-only mode"}
          </div>
        </div>

        <section className="mt-8 rounded-3xl bg-slate-900 p-6">
          <h2 className="text-2xl font-bold">Select Match</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <SelectField label="Session" value={selectedSessionId} onChange={handleSessionChange}>
              <option value="">Select session</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.session_date} - {session.session_name} - {session.turfs?.name || "Turf"}
                </option>
              ))}
            </SelectField>
            <SelectField label="Match" value={selectedMatchId} onChange={handleMatchChange}>
              <option value="">Select match</option>
              {sessionMatches.map((match) => (
                <option key={match.id} value={match.id}>
                  Match {match.match_number}: {match.team_a || "Team A"} vs {match.team_b || "Team B"}
                </option>
              ))}
            </SelectField>
            <SelectField label="Innings" value={String(inningsNumber)} onChange={(value) => setInningsNumber(Number(value))}>
              <option value="1">First Innings</option>
              <option value="2">Second Innings</option>
            </SelectField>
          </div>
        </section>

        {selectedMatch && selectedSession && (
          <>
            <section className="mt-8 rounded-3xl bg-slate-900 p-6">
              <h2 className="text-2xl font-bold">Team Assignment</h2>
              <p className="mt-2 text-sm text-slate-400">Assign the confirmed session players to Team A or Team B once for this match.</p>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {selectedSession.session_players.map((row) => (
                  <div key={row.player_id} className="rounded-xl border border-slate-700 bg-slate-800 p-4">
                    <p className="font-semibold">{row.players?.name || "Unknown player"}</p>
                    <select
                      value={teamAssignments[row.player_id] || ""}
                      onChange={(event) => setTeamAssignments((current) => ({ ...current, [row.player_id]: event.target.value as "A" | "B" | "" }))}
                      disabled={!isAdmin || events.length > 0}
                      className="mt-3 w-full rounded-lg border border-slate-600 bg-slate-900 p-2"
                    >
                      <option value="">Not assigned</option>
                      <option value="A">Team A</option>
                      <option value="B">Team B</option>
                    </select>
                  </div>
                ))}
              </div>
              <button
                onClick={saveTeamAssignments}
                disabled={!isAdmin || savingTeams || events.length > 0}
                className="mt-5 rounded-xl bg-blue-500 px-5 py-3 font-semibold disabled:opacity-40"
              >
                {savingTeams ? "Saving Teams..." : "Save Team Assignment"}
              </button>
              {events.length > 0 && <p className="mt-3 text-sm text-yellow-300">Team assignments are locked after scoring starts.</p>}
            </section>

            <section className="mt-8 overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 p-6">
              <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-widest text-green-300">
                    {selectedMatch.match_status === "completed" ? "Completed" : selectedMatch.match_status === "live" ? "● Live" : "Not Started"}
                  </p>
                  <h2 className="mt-2 text-3xl font-bold">Match {selectedMatch.match_number}</h2>
                  <p className="mt-2 text-slate-300">{selectedMatch.team_a || "Team A"} vs {selectedMatch.team_b || "Team B"}</p>
                  <p className="mt-2 text-sm text-slate-400">{inningsNumber === 1 ? "First Innings" : "Second Innings"}</p>
                  {selectedMatch.result_text && <p className="mt-4 text-lg font-bold text-green-300">🏆 {selectedMatch.result_text}</p>}
                </div>
                <div className="text-left md:text-right">
                  <p className="text-5xl font-black">{score.runs}/{score.wickets}</p>
                  <p className="mt-2 text-xl text-slate-300">{score.oversDisplay} overs</p>
                  <p className="mt-1 text-sm text-slate-400">Run rate: {score.runRate.toFixed(2)}</p>
                </div>
              </div>

              {chaseSummary && (
                <div className="mt-6 rounded-2xl border border-slate-700 bg-slate-950/50 p-5">
                  {chaseSummary.requiredRuns === 0 ? (
                    <p className="text-2xl font-bold text-green-300">🏆 Target achieved</p>
                  ) : (
                    <>
                      <p className="text-xl font-bold">Need {chaseSummary.requiredRuns} runs from {chaseSummary.remainingBalls} balls</p>
                      <p className="mt-2 text-slate-300">Target: {chaseSummary.target} • Required RR: {chaseSummary.requiredRunRate.toFixed(2)}</p>
                    </>
                  )}
                </div>
              )}

              <div className="mt-6 flex flex-wrap gap-2">
                {lastBalls.length === 0 ? <span className="text-slate-500">No balls recorded</span> : lastBalls.map((label, index) => (
                  <span key={`${label}-${index}`} className="flex h-10 min-w-10 items-center justify-center rounded-full bg-slate-700 px-3 font-bold">{label}</span>
                ))}
              </div>
            </section>

            <section className="mt-8 rounded-3xl bg-slate-900 p-6">
              <h2 className="text-2xl font-bold">Current Players</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <PlayerSelect label="Striker" value={strikerId} onChange={async (value) => { setStrikerId(value); await saveCurrentPlayers(value, nonStrikerId, bowlerId); }} players={battingPlayers} />
                <PlayerSelect label="Non-striker" value={nonStrikerId} onChange={async (value) => { setNonStrikerId(value); await saveCurrentPlayers(strikerId, value, bowlerId); }} players={battingPlayers} excludeId={strikerId} />
                <PlayerSelect label="Bowler" value={bowlerId} onChange={async (value) => { setBowlerId(value); await saveCurrentPlayers(strikerId, nonStrikerId, value); }} players={bowlingPlayers} />
              </div>
              <button onClick={swapStrike} disabled={!isAdmin || !strikerId || !nonStrikerId} className="mt-4 rounded-xl border border-blue-400 px-4 py-2 text-blue-300 disabled:opacity-40">⇄ Swap Strike</button>
              {!bowlerId && events.length > 0 && selectedMatch.match_status !== "completed" && (
                <p className="mt-4 rounded-xl bg-yellow-500/10 p-4 font-semibold text-yellow-300">
                  🏏 Over completed. Select the bowler for the next over before scoring continues.
                </p>
              )}
            </section>

            <section className="mt-8 rounded-3xl bg-slate-900 p-6">
              <h2 className="text-2xl font-bold">Live Scoring Controls</h2>
              <div className="mt-6 grid grid-cols-3 gap-3 md:grid-cols-7">
                {[0, 1, 2, 3, 4, 5, 6].map((runs) => (
                  <ScoreButton key={runs} label={String(runs)} disabled={!isAdmin || saving || !bowlerId || selectedMatch.match_status === "completed"} onClick={() => addBallEvent({ runsBat: runs, isLegalBall: true, description: `${runs} run${runs === 1 ? "" : "s"}` })} />
                ))}
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                <ActionButton label="Wide +1" disabled={!isAdmin || saving || !bowlerId || selectedMatch.match_status === "completed"} onClick={addWide} />
                <ActionButton label="No-ball +1" disabled={!isAdmin || saving || !bowlerId || selectedMatch.match_status === "completed"} onClick={addNoBall} />
                <ActionButton label="Bye +1" disabled={!isAdmin || saving || !bowlerId || selectedMatch.match_status === "completed"} onClick={() => addBye(1)} />
                <ActionButton label="Leg Bye +1" disabled={!isAdmin || saving || !bowlerId || selectedMatch.match_status === "completed"} onClick={() => addLegBye(1)} />
              </div>

              <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-800 p-5">
                <h3 className="text-lg font-bold">Wicket</h3>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <select value={wicketType} onChange={(event) => setWicketType(event.target.value)} className="rounded-xl border border-slate-600 bg-slate-900 p-3">
                    <option value="bowled">Bowled</option>
                    <option value="caught">Caught</option>
                    <option value="lbw">LBW</option>
                    <option value="run_out">Run Out</option>
                    <option value="stumped">Stumped</option>
                    <option value="hit_wicket">Hit Wicket</option>
                    <option value="retired_out">Retired Out</option>
                  </select>
                  <PlayerSelect label="Fielder (optional)" value={fielderId} onChange={setFielderId} players={bowlingPlayers} compact />
                  <button onClick={addWicket} disabled={!isAdmin || saving || !strikerId || !bowlerId || selectedMatch.match_status === "completed"} className="rounded-xl bg-red-500 px-5 py-3 font-bold disabled:opacity-40">Wicket</button>
                </div>
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-3">
                <button onClick={undoLastBall} disabled={!isAdmin || events.length === 0} className="rounded-xl border border-yellow-400 px-5 py-3 font-semibold text-yellow-300 disabled:opacity-40">↩ Undo Last Event</button>
                {inningsNumber === 1 ? (
                  <button onClick={startSecondInnings} disabled={!isAdmin || events.length === 0} className="rounded-xl bg-blue-500 px-5 py-3 font-semibold disabled:opacity-40">Start Second Innings</button>
                ) : (
                  <button onClick={() => finishMatch(false)} disabled={!isAdmin || events.length === 0} className="rounded-xl bg-green-500 px-5 py-3 font-semibold text-slate-950 disabled:opacity-40">Finish Match & Save Result</button>
                )}
                <button disabled className="rounded-xl border border-purple-400 px-5 py-3 font-semibold text-purple-300 opacity-50">🎙 Voice Scoring — Next</button>
              </div>
            </section>

            <section className="mt-8 grid gap-6 lg:grid-cols-2">
              <div className="rounded-3xl bg-slate-900 p-6">
                <h2 className="text-2xl font-bold">Batting Scorecard</h2>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead><tr className="border-b border-slate-700 text-slate-400"><th className="py-2">Batter</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead>
                    <tbody>{battingStats.map((stat) => (
                      <tr key={stat.playerId} className="border-b border-slate-800"><td className="py-3 font-semibold">{stat.name}{stat.playerId === strikerId ? " *" : ""}</td><td>{stat.runs}</td><td>{stat.balls}</td><td>{stat.fours}</td><td>{stat.sixes}</td><td>{stat.strikeRate.toFixed(1)}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-3xl bg-slate-900 p-6">
                <h2 className="text-2xl font-bold">Bowling Scorecard</h2>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead><tr className="border-b border-slate-700 text-slate-400"><th className="py-2">Bowler</th><th>O</th><th>R</th><th>W</th><th>Econ</th></tr></thead>
                    <tbody>{bowlingStats.map((stat) => (
                      <tr key={stat.playerId} className="border-b border-slate-800"><td className="py-3 font-semibold">{stat.name}</td><td>{stat.overs}</td><td>{stat.runs}</td><td>{stat.wickets}</td><td>{stat.economy.toFixed(2)}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            </section>

            <section className="mt-8 rounded-3xl bg-slate-900 p-6">
              <h2 className="text-2xl font-bold">Ball-by-Ball Timeline</h2>
              <div className="mt-5 space-y-3">
                {[...events].reverse().map((event) => (
                  <div key={event.id} className="flex flex-col gap-2 rounded-xl border border-slate-700 bg-slate-800 p-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-bold">Event {event.event_number}: {getEventDescription(event)}</p>
                      <p className="mt-1 text-sm text-slate-400">{playerMap.get(event.striker_id || "") || "Unknown batter"} facing {playerMap.get(event.bowler_id || "") || "Unknown bowler"}</p>
                    </div>
                    <div className="text-lg font-bold">{getEventLabel(event)}</div>
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

function getEventLabel(event: BallEvent) {
  if (event.is_wicket) return "W";
  if (event.extra_type === "wide") return event.extras > 1 ? `${event.extras}Wd` : "Wd";
  if (event.extra_type === "no_ball") return event.runs_bat > 0 ? `Nb+${event.runs_bat}` : "Nb";
  if (event.extra_type === "bye") return `${event.extras}B`;
  if (event.extra_type === "leg_bye") return `${event.extras}Lb`;
  return String(event.runs_bat);
}

function getEventDescription(event: BallEvent) {
  if (event.is_wicket) return `Wicket — ${(event.wicket_type || "dismissal").replaceAll("_", " ")}`;
  return event.description || getEventLabel(event);
}

function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return <div><label className="mb-2 block text-sm text-slate-300">{label}</label><select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3">{children}</select></div>;
}

function PlayerSelect({ label, value, onChange, players, excludeId, compact = false }: { label: string; value: string; onChange: (value: string) => void | Promise<void>; players: MatchPlayer[]; excludeId?: string; compact?: boolean }) {
  return <div><label className="mb-2 block text-sm text-slate-300">{label}</label><select value={value} onChange={(event) => onChange(event.target.value)} className={`w-full rounded-xl border border-slate-700 bg-slate-800 ${compact ? "p-3" : "p-3"}`}><option value="">Select player</option>{players.filter((row) => row.player_id !== excludeId).map((row) => <option key={row.player_id} value={row.player_id}>{row.players?.name || "Unknown"}</option>)}</select></div>;
}

function ScoreButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return <button onClick={onClick} disabled={disabled} className="rounded-2xl bg-green-500 py-4 text-xl font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">{label}</button>;
}

function ActionButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return <button onClick={onClick} disabled={disabled} className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 font-semibold hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40">{label}</button>;
}