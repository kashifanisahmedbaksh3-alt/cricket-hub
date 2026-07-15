"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type Session = {
  id: string;
  session_name: string;
  session_date: string;
  turfs: {
    name: string;
  } | null;
  matches: Match[];
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

function calculateInningsScore(events: BallEvent[]): InningsScore {
  const runs = events.reduce(
    (sum, event) =>
      sum + Number(event.runs_bat || 0) + Number(event.extras || 0),
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

export default function AiUmpirePage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [selectedMatchId, setSelectedMatchId] = useState("");
  const [inningsNumber, setInningsNumber] = useState(1);
  const [events, setEvents] = useState<BallEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [wicketType, setWicketType] = useState("bowled");

  async function loadAdminStatus() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    setIsAdmin(
      user?.email?.toLowerCase() ===
        "kashifanisahmedbaksh3@gmail.com"
    );
  }

  async function loadSessions() {
    setLoading(true);

    const { data, error } = await supabase
      .from("sessions")
      .select(`
        id,
        session_name,
        session_date,
        turfs (
          name
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
          result_text
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

  useEffect(() => {
    loadAdminStatus();
    loadSessions();
  }, []);

  useEffect(() => {
    loadBallEvents(selectedMatchId, inningsNumber);
  }, [selectedMatchId, inningsNumber]);

  const selectedSession = sessions.find(
    (session) => session.id === selectedSessionId
  );

  const sessionMatches = useMemo(() => {
    return [...(selectedSession?.matches || [])].sort(
      (a, b) => a.match_number - b.match_number
    );
  }, [selectedSession]);

  const selectedMatch = sessionMatches.find(
    (match) => match.id === selectedMatchId
  );

  const score = useMemo(() => {
    return calculateInningsScore(events);
  }, [events]);

  const chaseSummary = useMemo(() => {
    if (
      inningsNumber !== 2 ||
      !selectedMatch?.target_runs ||
      selectedMatch.target_runs <= 0
    ) {
      return null;
    }

    const target = Number(selectedMatch.target_runs);
    const requiredRuns = Math.max(target - score.runs, 0);

    const totalOvers = Number(selectedMatch.overs || 7);
    const totalBalls = totalOvers * 6;
    const remainingBalls = Math.max(totalBalls - score.legalBalls, 0);

    const requiredRunRate =
      remainingBalls > 0 ? requiredRuns / (remainingBalls / 6) : 0;

    return {
      target,
      requiredRuns,
      remainingBalls,
      requiredRunRate,
    };
  }, [inningsNumber, selectedMatch, score]);

  const lastBalls = useMemo(() => {
    return events.slice(-6).map(getEventLabel);
  }, [events]);

  function handleSessionChange(sessionId: string) {
    setSelectedSessionId(sessionId);
    setEvents([]);

    const session = sessions.find((item) => item.id === sessionId);
    const matches = [...(session?.matches || [])].sort(
      (a, b) => a.match_number - b.match_number
    );

    if (matches.length > 0) {
      setSelectedMatchId(matches[0].id);
      setInningsNumber(matches[0].current_innings || 1);
    } else {
      setSelectedMatchId("");
    }
  }

  function handleMatchChange(matchId: string) {
    setSelectedMatchId(matchId);

    const match = sessionMatches.find((item) => item.id === matchId);
    setInningsNumber(match?.current_innings || 1);
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

    if (selectedMatch?.match_status === "completed") {
      alert("This match has already been completed.");
      return;
    }

    setSaving(true);

    const nextEventNumber =
      events.length > 0
        ? Math.max(...events.map((event) => event.event_number)) + 1
        : 1;

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
    });

    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    await supabase
      .from("matches")
      .update({
        match_status: "live",
        current_innings: inningsNumber,
      })
      .eq("id", selectedMatchId);

    await loadBallEvents(selectedMatchId, inningsNumber);
  }

  async function addWide() {
    await addBallEvent({
      extras: 1,
      extraType: "wide",
      isLegalBall: false,
      description: "Wide",
    });
  }

  async function addNoBall() {
    await addBallEvent({
      extras: 1,
      extraType: "no_ball",
      isLegalBall: false,
      description: "No-ball",
    });
  }

  async function addBye(runs: number) {
    await addBallEvent({
      extras: runs,
      extraType: "bye",
      isLegalBall: true,
      description: `${runs} bye${runs === 1 ? "" : "s"}`,
    });
  }

  async function addLegBye(runs: number) {
    await addBallEvent({
      extras: runs,
      extraType: "leg_bye",
      isLegalBall: true,
      description: `${runs} leg bye${runs === 1 ? "" : "s"}`,
    });
  }

  async function addWicket() {
    await addBallEvent({
      isLegalBall: true,
      isWicket: true,
      selectedWicketType: wicketType,
      description: wicketType,
    });
  }

  async function undoLastBall() {
    if (!isAdmin) {
      alert("Please log in as admin.");
      return;
    }

    if (events.length === 0) {
      alert("There is no ball to undo.");
      return;
    }

    const lastEvent = events[events.length - 1];

    const confirmed = confirm(
      `Undo last event: ${getEventLabel(lastEvent)}?`
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from("ball_events")
      .delete()
      .eq("id", lastEvent.id);

    if (error) {
      alert(error.message);
      return;
    }

    await loadBallEvents(selectedMatchId, inningsNumber);
  }

  async function startSecondInnings() {
    if (!isAdmin || !selectedMatchId || !selectedMatch) return;

    if (inningsNumber !== 1) {
      alert("The second innings has already started.");
      return;
    }

    if (events.length === 0) {
      alert("Please record at least one delivery.");
      return;
    }

    const target = score.runs + 1;

    const confirmed = confirm(
      `End first innings at ${score.runs}/${score.wickets} and set target to ${target}?`
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from("matches")
      .update({
        current_innings: 2,
        target_runs: target,
        match_status: "live",
        batting_first_team: selectedMatch.team_a,
        team_a_runs: score.runs,
        team_a_wickets: score.wickets,
      })
      .eq("id", selectedMatchId);

    if (error) {
      alert(error.message);
      return;
    }

    setInningsNumber(2);
    setEvents([]);

    await loadSessions();
    await loadBallEvents(selectedMatchId, 2);
  }

  async function finishMatch() {
    if (!isAdmin || !selectedMatchId || !selectedMatch) return;

    if (inningsNumber !== 2) {
      alert("Finish the first innings and start the chase first.");
      return;
    }

    const confirmed = confirm(
      `Finish match with second-innings score ${score.runs}/${score.wickets}?`
    );

    if (!confirmed) return;

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

    const firstInningsEvents = matchEvents.filter(
      (event) => event.innings_number === 1
    );

    const secondInningsEvents = matchEvents.filter(
      (event) => event.innings_number === 2
    );

    const firstScore = calculateInningsScore(firstInningsEvents);
    const secondScore = calculateInningsScore(secondInningsEvents);

    const teamA = selectedMatch.team_a || "Team A";
    const teamB = selectedMatch.team_b || "Team B";

    let winner: string;
    let resultText: string;

    if (secondScore.runs > firstScore.runs) {
      const wicketsRemaining = Math.max(10 - secondScore.wickets, 0);

      winner = teamB;
      resultText = `${teamB} won by ${wicketsRemaining} wicket${
        wicketsRemaining === 1 ? "" : "s"
      }`;
    } else if (secondScore.runs < firstScore.runs) {
      const winningMargin = firstScore.runs - secondScore.runs;

      winner = teamA;
      resultText = `${teamA} won by ${winningMargin} run${
        winningMargin === 1 ? "" : "s"
      }`;
    } else {
      winner = "Tie";
      resultText = "Match tied";
    }

    const { error: updateError } = await supabase
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

    if (updateError) {
      alert(updateError.message);
      return;
    }

    alert(
      `Match completed!\n\n${teamA}: ${firstScore.runs}/${firstScore.wickets}\n${teamB}: ${secondScore.runs}/${secondScore.wickets}\n\n${resultText}`
    );

    await loadSessions();
    await loadBallEvents(selectedMatchId, 2);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        Loading AI Match Centre...
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
            <h1 className="text-4xl font-bold">🤖 AI Match Centre</h1>
            <p className="mt-2 text-slate-300">
              Ball-by-ball live scoring with automatic match results.
            </p>
          </div>

          <div
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${
              isAdmin
                ? "bg-green-500/20 text-green-300"
                : "bg-yellow-500/20 text-yellow-300"
            }`}
          >
            {isAdmin
              ? "👑 Admin scoring enabled"
              : "👀 Public view-only mode"}
          </div>
        </div>

        <section className="mt-8 rounded-3xl bg-slate-900 p-6">
          <h2 className="text-2xl font-bold">Select Match</h2>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <SelectField
              label="Session"
              value={selectedSessionId}
              onChange={handleSessionChange}
            >
              <option value="">Select session</option>

              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.session_date} - {session.session_name} -{" "}
                  {session.turfs?.name || "Turf"}
                </option>
              ))}
            </SelectField>

            <SelectField
              label="Match"
              value={selectedMatchId}
              onChange={handleMatchChange}
            >
              <option value="">Select match</option>

              {sessionMatches.map((match) => (
                <option key={match.id} value={match.id}>
                  Match {match.match_number}: {match.team_a || "Team A"} vs{" "}
                  {match.team_b || "Team B"}
                </option>
              ))}
            </SelectField>

            <SelectField
              label="Innings"
              value={String(inningsNumber)}
              onChange={(value) => setInningsNumber(Number(value))}
            >
              <option value="1">First Innings</option>
              <option value="2">Second Innings</option>
            </SelectField>
          </div>
        </section>

        {selectedMatch ? (
          <>
            <section className="mt-8 overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 p-6">
              <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-widest text-green-300">
                    {selectedMatch.match_status === "completed"
                      ? "Completed"
                      : selectedMatch.match_status === "live"
                        ? "● Live"
                        : "Not Started"}
                  </p>

                  <h2 className="mt-2 text-3xl font-bold">
                    Match {selectedMatch.match_number}
                  </h2>

                  <p className="mt-2 text-slate-300">
                    {selectedMatch.team_a || "Team A"} vs{" "}
                    {selectedMatch.team_b || "Team B"}
                  </p>

                  <p className="mt-2 text-sm text-slate-400">
                    {inningsNumber === 1
                      ? "First Innings"
                      : "Second Innings"}
                  </p>

                  {selectedMatch.result_text && (
                    <p className="mt-4 text-lg font-bold text-green-300">
                      🏆 {selectedMatch.result_text}
                    </p>
                  )}
                </div>

                <div className="text-left md:text-right">
                  <p className="text-5xl font-black">
                    {score.runs}/{score.wickets}
                  </p>

                  <p className="mt-2 text-xl text-slate-300">
                    {score.oversDisplay} overs
                  </p>

                  <p className="mt-1 text-sm text-slate-400">
                    Run rate: {score.runRate.toFixed(2)}
                  </p>
                </div>
              </div>

              {chaseSummary && (
                <div className="mt-6 rounded-2xl border border-slate-700 bg-slate-950/50 p-5">
                  {chaseSummary.requiredRuns === 0 ? (
                    <p className="text-2xl font-bold text-green-300">
                      🏆 Target achieved
                    </p>
                  ) : (
                    <>
                      <p className="text-xl font-bold">
                        Need {chaseSummary.requiredRuns} runs from{" "}
                        {chaseSummary.remainingBalls} balls
                      </p>

                      <p className="mt-2 text-slate-300">
                        Target: {chaseSummary.target} • Required RR:{" "}
                        {chaseSummary.requiredRunRate.toFixed(2)}
                      </p>
                    </>
                  )}
                </div>
              )}

              <div className="mt-6">
                <p className="text-sm text-slate-400">Last events</p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {lastBalls.length === 0 && (
                    <span className="text-slate-500">
                      No balls recorded
                    </span>
                  )}

                  {lastBalls.map((label, index) => (
                    <span
                      key={`${label}-${index}`}
                      className="flex h-10 min-w-10 items-center justify-center rounded-full bg-slate-700 px-3 font-bold"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            </section>

            <section className="mt-8 rounded-3xl bg-slate-900 p-6">
              <h2 className="text-2xl font-bold">
                Live Scoring Controls
              </h2>

              {!isAdmin && (
                <p className="mt-3 rounded-xl bg-yellow-500/10 p-4 text-yellow-300">
                  Login as admin to enter ball-by-ball scores.
                </p>
              )}

              <div className="mt-6 grid grid-cols-3 gap-3 md:grid-cols-7">
                {[0, 1, 2, 3, 4, 5, 6].map((runs) => (
                  <ScoreButton
                    key={runs}
                    label={String(runs)}
                    disabled={
                      !isAdmin ||
                      saving ||
                      selectedMatch.match_status === "completed"
                    }
                    onClick={() =>
                      addBallEvent({
                        runsBat: runs,
                        isLegalBall: true,
                        description: `${runs} run${
                          runs === 1 ? "" : "s"
                        }`,
                      })
                    }
                  />
                ))}
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                <ActionButton
                  label="Wide +1"
                  disabled={
                    !isAdmin ||
                    saving ||
                    selectedMatch.match_status === "completed"
                  }
                  onClick={addWide}
                />

                <ActionButton
                  label="No-ball +1"
                  disabled={
                    !isAdmin ||
                    saving ||
                    selectedMatch.match_status === "completed"
                  }
                  onClick={addNoBall}
                />

                <ActionButton
                  label="Bye +1"
                  disabled={
                    !isAdmin ||
                    saving ||
                    selectedMatch.match_status === "completed"
                  }
                  onClick={() => addBye(1)}
                />

                <ActionButton
                  label="Leg Bye +1"
                  disabled={
                    !isAdmin ||
                    saving ||
                    selectedMatch.match_status === "completed"
                  }
                  onClick={() => addLegBye(1)}
                />
              </div>

              <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-800 p-5">
                <h3 className="text-lg font-bold">Wicket</h3>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <select
                    value={wicketType}
                    onChange={(event) =>
                      setWicketType(event.target.value)
                    }
                    disabled={
                      !isAdmin ||
                      selectedMatch.match_status === "completed"
                    }
                    className="rounded-xl border border-slate-600 bg-slate-900 p-3"
                  >
                    <option value="bowled">Bowled</option>
                    <option value="caught">Caught</option>
                    <option value="lbw">LBW</option>
                    <option value="run_out">Run Out</option>
                    <option value="stumped">Stumped</option>
                    <option value="hit_wicket">Hit Wicket</option>
                    <option value="retired_out">Retired Out</option>
                  </select>

                  <button
                    onClick={addWicket}
                    disabled={
                      !isAdmin ||
                      saving ||
                      selectedMatch.match_status === "completed"
                    }
                    className="rounded-xl bg-red-500 px-5 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Wicket
                  </button>
                </div>
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-3">
                <button
                  onClick={undoLastBall}
                  disabled={
                    !isAdmin ||
                    events.length === 0 ||
                    selectedMatch.match_status === "completed"
                  }
                  className="rounded-xl border border-yellow-400 px-5 py-3 font-semibold text-yellow-300 disabled:opacity-40"
                >
                  ↩ Undo Last Event
                </button>

                {inningsNumber === 1 ? (
                  <button
                    onClick={startSecondInnings}
                    disabled={
                      !isAdmin ||
                      events.length === 0 ||
                      selectedMatch.match_status === "completed"
                    }
                    className="rounded-xl bg-blue-500 px-5 py-3 font-semibold text-white disabled:opacity-40"
                  >
                    Start Second Innings
                  </button>
                ) : (
                  <button
                    onClick={finishMatch}
                    disabled={
                      !isAdmin ||
                      events.length === 0 ||
                      selectedMatch.match_status === "completed"
                    }
                    className="rounded-xl bg-green-500 px-5 py-3 font-semibold text-slate-950 disabled:opacity-40"
                  >
                    Finish Match & Save Result
                  </button>
                )}

                <button
                  disabled
                  className="rounded-xl border border-purple-400 px-5 py-3 font-semibold text-purple-300 opacity-50"
                >
                  🎙 Voice Scoring — Next
                </button>
              </div>
            </section>

            <section className="mt-8 rounded-3xl bg-slate-900 p-6">
              <h2 className="text-2xl font-bold">
                Ball-by-Ball Timeline
              </h2>

              <div className="mt-5 space-y-3">
                {events.length === 0 && (
                  <p className="text-slate-400">
                    No ball events recorded for this innings.
                  </p>
                )}

                {[...events].reverse().map((event) => (
                  <div
                    key={event.id}
                    className="flex flex-col gap-2 rounded-xl border border-slate-700 bg-slate-800 p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <p className="font-bold">
                        Event {event.event_number}:{" "}
                        {getEventDescription(event)}
                      </p>

                      <p className="mt-1 text-sm text-slate-400">
                        {event.is_legal_ball
                          ? "Legal delivery"
                          : "Extra delivery"}
                      </p>
                    </div>

                    <div className="text-lg font-bold">
                      {getEventLabel(event)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : (
          <section className="mt-8 rounded-3xl bg-slate-900 p-6">
            <p className="text-slate-400">
              Select a session and match to start live scoring.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}

function getEventLabel(event: BallEvent) {
  if (event.is_wicket) return "W";

  if (event.extra_type === "wide") {
    return event.extras > 1 ? `${event.extras}Wd` : "Wd";
  }

  if (event.extra_type === "no_ball") {
    return event.runs_bat > 0
      ? `Nb+${event.runs_bat}`
      : event.extras > 1
        ? `${event.extras}Nb`
        : "Nb";
  }

  if (event.extra_type === "bye") return `${event.extras}B`;
  if (event.extra_type === "leg_bye")
    return `${event.extras}Lb`;

  return String(event.runs_bat);
}

function getEventDescription(event: BallEvent) {
  if (event.is_wicket) {
    return `Wicket — ${(
      event.wicket_type || "dismissal"
    ).replaceAll("_", " ")}`;
  }

  return event.description || getEventLabel(event);
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm text-slate-300">
        {label}
      </label>

      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3"
      >
        {children}
      </select>
    </div>
  );
}

function ScoreButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-2xl bg-green-500 py-4 text-xl font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
    </button>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 font-semibold hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
    </button>
  );
}