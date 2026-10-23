"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type Session = { id: string; session_name: string | null; session_date: string };
type Match = {
  id: string;
  match_number: number;
  team_a: string | null;
  team_b: string | null;
  team_a_runs: number | null;
  team_a_wickets: number | null;
  team_b_runs: number | null;
  team_b_wickets: number | null;
  winner: string | null;
  result_text: string | null;
  match_status: string | null;
  batting_first_side: string | null;
  batting_first_team: string | null;
  overs: number | null;
};
type Delivery = {
  id: string;
  match_id: string;
  innings: number;
  ball_index: number;
  bowler_name: string;
  striker_name: string | null;
  runs_bat: number;
  extra_type: string | null;
  extra_runs: number;
  wicket: boolean;
};
type Bowling = { name: string; balls: number; deliveries: number; runs: number; wickets: number; wides: number; noBalls: number };
type Batting = { name: string; runs: number; balls: number; fours: number; sixes: number; recordedWickets: number };
type Stats = {
  score: number;
  wickets: number;
  legalBalls: number;
  extras: number;
  battingRuns: number;
  unassignedBatRuns: number;
  unassignedDeliveries: number;
  bowling: Bowling[];
  batting: Batting[];
};

const fieldClass = "w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-3 text-white outline-none focus:border-cyan-400";
const cardClass = "rounded-2xl border border-slate-700 bg-slate-900 p-4 sm:p-5";

function displayDate(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
}
function oversFromBalls(balls: number) {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}
function safeName(name: string | null | undefined) {
  return name?.trim() || "";
}
function buildStats(balls: Delivery[]): Stats {
  const bowlers = new Map<string, Bowling>();
  const batters = new Map<string, Batting>();
  let score = 0;
  let wickets = 0;
  let legalBalls = 0;
  let extras = 0;
  let battingRuns = 0;
  let unassignedBatRuns = 0;
  let unassignedDeliveries = 0;

  for (const b of balls) {
    const isLegal = b.extra_type !== "wide" && b.extra_type !== "no_ball";
    const bat = Number(b.runs_bat || 0);
    const extra = Number(b.extra_runs || 0);
    const total = bat + extra;
    score += total;
    extras += extra;
    battingRuns += bat;
    wickets += b.wicket ? 1 : 0;
    legalBalls += isLegal ? 1 : 0;

    const bowlerName = safeName(b.bowler_name) || "Unknown bowler";
    const bowler = bowlers.get(bowlerName) || {
      name: bowlerName, balls: 0, deliveries: 0, runs: 0, wickets: 0, wides: 0, noBalls: 0,
    };
    bowler.balls += isLegal ? 1 : 0;
    bowler.deliveries += 1;
    bowler.runs += total;
    bowler.wickets += b.wicket ? 1 : 0;
    bowler.wides += b.extra_type === "wide" ? 1 : 0;
    bowler.noBalls += b.extra_type === "no_ball" ? 1 : 0;
    bowlers.set(bowlerName, bowler);

    const striker = safeName(b.striker_name);
    if (!striker) {
      unassignedDeliveries += 1;
      unassignedBatRuns += bat;
      continue;
    }
    const batter = batters.get(striker) || {
      name: striker, runs: 0, balls: 0, fours: 0, sixes: 0, recordedWickets: 0,
    };
    batter.runs += bat;
    // Wides are never faced; no-balls DO count as balls faced by a batter.
    batter.balls += b.extra_type === "wide" ? 0 : 1;
    batter.fours += bat === 4 ? 1 : 0;
    batter.sixes += bat === 6 ? 1 : 0;
    batter.recordedWickets += b.wicket ? 1 : 0;
    batters.set(striker, batter);
  }
  return {
    score, wickets, legalBalls, extras, battingRuns,
    unassignedBatRuns, unassignedDeliveries,
    bowling: [...bowlers.values()].sort((a, b) => b.wickets - a.wickets || a.runs - b.runs || a.name.localeCompare(b.name)),
    batting: [...batters.values()].sort((a, b) => b.runs - a.runs || a.name.localeCompare(b.name)),
  };
}
function firstBattingSide(match: Match): "A" | "B" {
  if (match.batting_first_side === "B") return "B";
  if (match.batting_first_side === "A") return "A";
  // Older matches may not store the side, but may store the team name.
  if (match.batting_first_team && safeName(match.batting_first_team).toLowerCase() === safeName(match.team_b).toLowerCase()) return "B";
  return "A";
}
function battingTeam(match: Match, innings: number) {
  const first = firstBattingSide(match);
  const side = innings === 1 ? first : first === "A" ? "B" : "A";
  return side === "A" ? (match.team_a || "Team A") : (match.team_b || "Team B");
}
function savedScore(match: Match, innings: number) {
  const side = innings === 1 ? firstBattingSide(match) : firstBattingSide(match) === "A" ? "B" : "A";
  return {
    runs: Number(side === "A" ? match.team_a_runs || 0 : match.team_b_runs || 0),
    wickets: Number(side === "A" ? match.team_a_wickets || 0 : match.team_b_wickets || 0),
  };
}
function BowlingCard({ rows, title }: { rows: Bowling[]; title: string }) {
  return (
    <section className={cardClass}>
      <h3 className="text-lg font-bold">🎯 {title}</h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">No bowling deliveries recorded in Quick Scorer.</p>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-[minmax(0,1fr)_3rem_3rem_2.5rem] gap-2 px-2 text-xs text-slate-400">
            <span>Bowler</span><span className="text-right">Overs</span><span className="text-right">Runs</span><span className="text-right">Wkts</span>
          </div>
          {rows.map(b => (
            <div key={b.name} className="rounded-xl bg-slate-800 px-3 py-3">
              <div className="grid grid-cols-[minmax(0,1fr)_3rem_3rem_2.5rem] items-center gap-2">
                <span className="min-w-0 break-words text-sm font-semibold">{b.name}</span>
                <span className="text-right text-sm tabular-nums">{oversFromBalls(b.balls)}</span>
                <span className="text-right text-sm tabular-nums">{b.runs}</span>
                <span className="text-right font-bold tabular-nums text-cyan-300">{b.wickets}</span>
              </div>
              {(b.wides > 0 || b.noBalls > 0) && <p className="mt-1 text-xs text-slate-400">Wide deliveries: {b.wides} · No-balls: {b.noBalls}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
function BattingCard({ rows, title, missingRuns, missingDeliveries }: {
  rows: Batting[]; title: string; missingRuns: number; missingDeliveries: number;
}) {
  return (
    <section className={cardClass}>
      <h3 className="text-lg font-bold">🏏 {title}</h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">No striker names were recorded for this selection.</p>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-[minmax(0,1fr)_3rem_3rem_3rem_3rem] gap-2 px-2 text-xs text-slate-400">
            <span>Batter</span><span className="text-right">Runs</span><span className="text-right">Balls</span><span className="text-right">4s/6s</span>
          </div>
          {rows.map(b => (
            <div key={b.name} className="grid grid-cols-[minmax(0,1fr)_3rem_3rem_3rem_3rem] items-center gap-2 rounded-xl bg-slate-800 px-3 py-3">
              <span className="min-w-0 break-words text-sm font-semibold">{b.name}</span>
              <span className="text-right font-bold tabular-nums text-green-300">{b.runs}</span>
              <span className="text-right text-sm tabular-nums">{b.balls}</span>
              <span className="text-right text-xs tabular-nums">{b.fours}/{b.sixes}</span>
            </div>
          ))}
        </div>
      )}
      {missingDeliveries > 0 && (
        <p className="mt-3 rounded-lg border border-amber-900 bg-amber-950/60 p-3 text-sm text-amber-200">
          Batter not selected on {missingDeliveries} recorded deliveries; {missingRuns} bat run{missingRuns === 1 ? "" : "s"} cannot be assigned to a player.
        </p>
      )}
      <p className="mt-3 text-xs text-slate-400">Batting runs are credited to the striker saved on each ball. Generic Player 1/2 labels mean an unnamed player; older deliveries without a name remain unassigned.</p>
    </section>
  );
}

export default function MatchSummaryPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [matchId, setMatchId] = useState("all");
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const activeSession = sessions.find(s => s.id === sessionId);

  useEffect(() => {
    let active = true;
    async function initialLoad() {
      const { data, error: sessionError } = await supabase.from("sessions")
        .select("id,session_name,session_date")
        .order("session_date", { ascending: false }).limit(100);
      if (!active) return;
      if (sessionError) setError(sessionError.message);
      else {
        const items = (data || []) as Session[];
        setSessions(items);
        if (items.length) setSessionId(items[0].id);
      }
      setLoadingSessions(false);
    }
    void initialLoad();
    return () => { active = false; };
  }, []);

  const loadData = useCallback(async (id: string, alive: () => boolean) => {
    setLoadingData(true);
    setError("");
    const { data: matchData, error: matchError } = await supabase.from("matches")
      .select("id,match_number,team_a,team_b,team_a_runs,team_a_wickets,team_b_runs,team_b_wickets,winner,result_text,match_status,batting_first_side,batting_first_team,overs")
      .eq("session_id", id).order("match_number", { ascending: true });
    if (!alive()) return;
    if (matchError) { setError(matchError.message); setMatches([]); setDeliveries([]); setLoadingData(false); return; }
    const items = (matchData || []) as Match[];
    const ids = items.map(m => m.id);
    const log: Delivery[] = [];
    if (ids.length) {
      // Pagination avoids Supabase's default maximum-row limit for long sessions.
      for (let start = 0; ; start += 500) {
        const { data: page, error: ballError } = await supabase.from("match_quick_balls")
          .select("id,match_id,innings,ball_index,bowler_name,striker_name,runs_bat,extra_type,extra_runs,wicket")
          .in("match_id", ids)
          .order("id", { ascending: true })
          .range(start, start + 499);
        if (!alive()) return;
        if (ballError) { setError(`Could not read Quick Scorer deliveries: ${ballError.message}`); setMatches(items); setDeliveries([]); setLoadingData(false); return; }
        log.push(...((page || []) as Delivery[]));
        if (!page || page.length < 500) break;
      }
    }
    if (!alive()) return;
    setMatches(items);
    setDeliveries(log);
    setLoadingData(false);
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    setMatches([]);
    setDeliveries([]);
    setMatchId("all");
    void loadData(sessionId, () => active);
    return () => { active = false; };
  }, [sessionId, loadData]);

  const visibleMatches = useMemo(() => matchId === "all" ? matches : matches.filter(m => m.id === matchId), [matchId, matches]);
  const visibleMatchIds = useMemo(() => new Set(visibleMatches.map(m => m.id)), [visibleMatches]);
  const selectedDeliveries = useMemo(() => deliveries.filter(b => visibleMatchIds.has(b.match_id)), [deliveries, visibleMatchIds]);
  // Generic Player 1 / Player 2 labels belong to a specific match and innings.
  // Namespace them for the session-wide summary so unrelated matches are never merged.
  const sessionStats = useMemo(() => {
    const matchNumbers = new Map(matches.map(m => [m.id,m.match_number]));
    return buildStats(selectedDeliveries.map(b => {
      const label = safeName(b.striker_name);
      if (!/^Player \d+$/i.test(label)) return b;
      return {
        ...b,
        striker_name: `Match ${matchNumbers.get(b.match_id) ?? "?"}, Innings ${b.innings} — ${label}`,
      };
    }));
  }, [selectedDeliveries, matches]);
  const matchBallMap = useMemo(() => {
    const map = new Map<string, Delivery[]>();
    for (const ball of deliveries) {
      const arr = map.get(ball.match_id) || [];
      arr.push(ball);
      map.set(ball.match_id, arr);
    }
    return map;
  }, [deliveries]);
  const completedCount = matches.filter(m => m.match_status === "completed").length;
  const recordedMatchCount = matches.filter(m => (matchBallMap.get(m.id) || []).length > 0).length;

  async function copySummary() {
    if (!activeSession) return;
    const lines = [
      `🏏 Ittehaad Cricket — ${displayDate(activeSession.session_date)}`,
      activeSession.session_name || "Cricket Session",
      ...visibleMatches.map(m => `Match ${m.match_number}: ${m.team_a || "Team A"} ${m.team_a_runs ?? 0}/${m.team_a_wickets ?? 0} vs ${m.team_b || "Team B"} ${m.team_b_runs ?? 0}/${m.team_b_wickets ?? 0}${m.winner ? ` · Winner: ${m.winner}` : ""}`),
      "",
      "Bowling (Quick Scorer deliveries):",
      ...sessionStats.bowling.map(b => `${b.name}: ${oversFromBalls(b.balls)} overs, ${b.runs} runs, ${b.wickets} wickets`),
      "",
      "Batting (recorded names or numbered placeholders):",
      ...sessionStats.batting.map(b => `${b.name}: ${b.runs} runs (${b.balls} balls)`),
      sessionStats.unassignedDeliveries ? `Batter not selected on ${sessionStats.unassignedDeliveries} deliveries.` : "",
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopyMessage("Copied! You can paste this into WhatsApp.");
    } catch {
      setCopyMessage("Clipboard unavailable. You can still read the summary on this page.");
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-3 py-5 text-white sm:px-6">
      <div className="mx-auto max-w-4xl">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div><h1 className="text-3xl font-black">📊 Match Summary</h1><p className="mt-1 text-sm text-slate-400">Match-by-match and full-session cricket statistics</p></div>
          <div className="flex flex-wrap gap-2"><a href="/scorer" className="rounded-xl border border-slate-600 px-3 py-2 text-sm">⚡ Scorer</a><a href="/" className="rounded-xl border border-slate-600 px-3 py-2 text-sm">← Home</a></div>
        </header>

        {error && <p role="alert" className="mb-4 rounded-xl border border-rose-800 bg-rose-950 p-3 text-sm text-rose-200">{error}</p>}
        <section className={cardClass}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold">1. Session (latest selected)
              <select className={`mt-2 ${fieldClass}`} disabled={loadingSessions} value={sessionId} onChange={e => setSessionId(e.target.value)}>
                {sessions.length === 0 && <option value="">{loadingSessions ? "Loading sessions..." : "No sessions found"}</option>}
                {sessions.map((s, i) => <option key={s.id} value={s.id}>{displayDate(s.session_date)} — {s.session_name || "Cricket"}{i === 0 ? " (Latest)" : ""}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold">2. View
              <select className={`mt-2 ${fieldClass}`} value={matchId} disabled={loadingData || !matches.length} onChange={e => setMatchId(e.target.value)}>
                <option value="all">All matches — session summary</option>
                {matches.map(m => <option key={m.id} value={m.id}>Match {m.match_number} — {m.team_a || "Team A"} vs {m.team_b || "Team B"}</option>)}
              </select>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => { if (sessionId) void loadData(sessionId, () => true); }} disabled={!sessionId || loadingData} className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold disabled:opacity-40">↻ Refresh</button>
            <button type="button" onClick={() => void copySummary()} disabled={loadingData || !visibleMatches.length} className="rounded-xl bg-green-500 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-40">Copy for WhatsApp</button>
          </div>
          {copyMessage && <p role="status" className="mt-2 text-sm text-green-300">{copyMessage}</p>}
        </section>

        {loadingData && <p className="mt-5 text-sm text-slate-300">Loading scores and ball records...</p>}
        {!loadingData && activeSession && matches.length === 0 && <p className="mt-5 rounded-xl border border-slate-700 p-4 text-slate-300">No matches have been created for this session yet.</p>}
        {!loadingData && visibleMatches.length > 0 && <>
          <section className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
            <div className={cardClass}><p className="text-xs text-slate-400">Matches</p><p className="mt-1 text-2xl font-black">{matchId === "all" ? matches.length : 1}</p></div>
            <div className={cardClass}><p className="text-xs text-slate-400">Completed</p><p className="mt-1 text-2xl font-black text-green-300">{matchId === "all" ? completedCount : Number(visibleMatches[0]?.match_status === "completed")}</p></div>
            <div className={cardClass}><p className="text-xs text-slate-400">Log available</p><p className="mt-1 text-2xl font-black text-cyan-300">{matchId === "all" ? recordedMatchCount : Number((matchBallMap.get(visibleMatches[0]?.id) || []).length > 0)}</p></div>
          </section>

          {matchId === "all" && <>
            <h2 className="mb-3 mt-6 text-xl font-extrabold">📋 Full Session Summary</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <BowlingCard title="Bowling — All Matches" rows={sessionStats.bowling} />
              <BattingCard title="Batting — All Matches" rows={sessionStats.batting} missingRuns={sessionStats.unassignedBatRuns} missingDeliveries={sessionStats.unassignedDeliveries} />
            </div>
          </>}

          <h2 className="mb-3 mt-6 text-xl font-extrabold">🏟️ {matchId === "all" ? "Match Results" : "Match Details"}</h2>
          <div className="space-y-4">
            {visibleMatches.map(m => {
              const matchBalls = matchBallMap.get(m.id) || [];
              const first = buildStats(matchBalls.filter(b => b.innings === 1));
              const second = buildStats(matchBalls.filter(b => b.innings === 2));
              const battingFirst = battingTeam(m, 1);
              const battingSecond = battingTeam(m, 2);
              const firstSaved = savedScore(m, 1);
              const secondSaved = savedScore(m, 2);
              const discrepancy = matchBalls.length > 0 && (firstSaved.runs !== first.score || secondSaved.runs !== second.score || firstSaved.wickets !== first.wickets || secondSaved.wickets !== second.wickets);
              return (
                <article key={m.id} className={cardClass}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div><h3 className="text-xl font-black">Match {m.match_number}</h3><p className="mt-1 text-sm text-slate-300">{m.team_a || "Team A"} vs {m.team_b || "Team B"}</p></div>
                    <span className={`rounded-lg px-3 py-1 text-xs font-semibold ${m.match_status === "completed" ? "bg-green-950 text-green-300" : "bg-slate-800 text-slate-300"}`}>{m.match_status === "completed" ? "Completed" : m.match_status || "Not started"}</span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-slate-800 p-3"><p className="text-xs text-slate-400">{battingFirst} · 1st innings</p><p className="mt-1 text-2xl font-black">{firstSaved.runs}/{firstSaved.wickets}</p>{matchBalls.length > 0 && <p className="text-xs text-slate-400">{oversFromBalls(first.legalBalls)} overs logged</p>}</div>
                    <div className="rounded-xl bg-slate-800 p-3"><p className="text-xs text-slate-400">{battingSecond} · 2nd innings</p><p className="mt-1 text-2xl font-black">{secondSaved.runs}/{secondSaved.wickets}</p>{matchBalls.length > 0 && <p className="text-xs text-slate-400">{oversFromBalls(second.legalBalls)} overs logged</p>}</div>
                  </div>
                  {(m.result_text || m.winner) && <p className="mt-3 font-bold text-green-300">🏆 {m.result_text || `Winner: ${m.winner}`}</p>}
                  {discrepancy && <p className="mt-3 rounded-lg bg-amber-950 p-3 text-sm text-amber-200">Saved match totals and delivery totals differ. The scoreboard above shows saved match totals; the statistics below come from logged deliveries.</p>}
                  {matchBalls.length === 0 ? (
                    <p className="mt-3 rounded-xl bg-slate-800 p-3 text-sm text-slate-300">No Quick Scorer deliveries saved for this match. Existing match scores are displayed, but individual bowler/batter statistics cannot be reconstructed.</p>
                  ) : (
                    <details className="mt-4 rounded-xl border border-slate-700 bg-slate-950/50 p-3" open={matchId !== "all"}>
                      <summary className="cursor-pointer font-bold text-cyan-200">View innings-wise bowling and batting</summary>
                      <div className="mt-4 space-y-5">
                        {([1, 2] as const).map(inn => {
                          const stats = inn === 1 ? first : second;
                          if (!matchBalls.some(b => b.innings === inn)) return <p className="text-sm text-slate-400" key={inn}>Innings {inn}: no deliveries logged yet.</p>;
                          return (
                            <div key={inn}>
                              <h4 className="mb-3 font-bold">Innings {inn} — {battingTeam(m, inn)} ({stats.score}/{stats.wickets}, {oversFromBalls(stats.legalBalls)} overs)</h4>
                              <div className="grid gap-3 sm:grid-cols-2">
                                <BowlingCard title="Bowling" rows={stats.bowling} />
                                <BattingCard title="Batting (optional)" rows={stats.batting} missingRuns={stats.unassignedBatRuns} missingDeliveries={stats.unassignedDeliveries} />
                              </div>
                              <p className="mt-2 text-xs text-slate-400">Innings extras recorded: {stats.extras}</p>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  )}
                </article>
              );
            })}
          </div>
          <p className="my-6 text-xs text-slate-400">Bowling figures reflect Quick Scorer deliveries, where the WICKET button records a bowler wicket. Run-outs, byes, leg-byes and detailed dismissal types are not yet recorded. Numbered placeholders identify unnamed batters; older records without a striker remain unassigned. No AI Match Centre deliveries are inferred.</p>
        </>}
      </div>
    </main>
  );
}
