"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

const ADMIN_EMAIL = "kashifanisahmedbaksh3@gmail.com";
type Side = "A" | "B";
type RatedPlayer = {
  id: string;
  name: string;
  batting_rating: number | null;
  bowling_rating: number | null;
};
type SessionPlayer = { player_id: string; players: RatedPlayer | null };
type TeamPlayer = { player_id: string; team_side: Side };
type Session = {
  id: string;
  session_name: string;
  session_date: string;
  team_a_name: string | null;
  team_b_name: string | null;
  captain_a_player_id: string | null;
  captain_b_player_id: string | null;
  session_players: SessionPlayer[];
  session_team_players: TeamPlayer[];
};
type Allocation = Record<string, Side>;

function dateLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

function score(player: RatedPlayer, kind: "batting" | "bowling"): number {
  return Number(kind === "batting" ? player.batting_rating : player.bowling_rating);
}
function totals(players: RatedPlayer[]) {
  const bat = players.reduce((sum, p) => sum + score(p, "batting"), 0);
  const bowl = players.reduce((sum, p) => sum + score(p, "bowling"), 0);
  return { bat, bowl, overall: bat + bowl, count: players.length };
}
function imbalance(a: RatedPlayer[], b: RatedPlayer[]): number {
  const x = totals(a), y = totals(b);
  return Math.abs(x.bat - y.bat) * 3 + Math.abs(x.bowl - y.bowl) * 3;
}
function shuffle<T>(input: T[]): T[] {
  const copy = [...input];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Past team assignments remain attached to their dated session records.
// Each recent session contributes a penalty when the same pair is put together again.
type PairHistory = Map<string, number>;
function pairKey(a: string, b: string) { return a < b ? `${a}|${b}` : `${b}|${a}`; }
function buildHistory(all: Session[], current: Session | undefined): { pairs: PairHistory; sessionsUsed: number } {
  const pairs = new Map<string, number>();
  if (!current) return { pairs, sessionsUsed: 0 };
  const earlier = all.filter(s => s.id !== current.id && s.session_date < current.session_date
    && s.session_team_players?.length >= 2)
    .sort((a, b) => b.session_date.localeCompare(a.session_date))
    .slice(0, 12);
  const weights = [8, 6, 5, 4, 3, 2, 2, 2, 1, 1, 1, 1];
  earlier.forEach((s, index) => {
    for (const side of ["A", "B"] as Side[]) {
      const ids = s.session_team_players.filter(p => p.team_side === side).map(p => p.player_id);
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
        const key = pairKey(ids[i], ids[j]);
        pairs.set(key, (pairs.get(key) || 0) + weights[index]);
      }
    }
  });
  return { pairs, sessionsUsed: earlier.length };
}
function teammateRepeatPenalty(a: RatedPlayer[], b: RatedPlayer[], history: PairHistory): number {
  let sum = 0;
  for (const group of [a, b]) {
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
      sum += history.get(pairKey(group[i].id, group[j].id)) || 0;
    }
  }
  return sum;
}
function allocationPenalty(a: RatedPlayer[], b: RatedPlayer[], history: PairHistory): number {
  const left = totals(a), right = totals(b);
  // Balance individual batting and bowling first; rotation breaks close ties.
  return Math.abs(left.bat - right.bat) * 12
    + Math.abs(left.bowl - right.bowl) * 12
    + Math.abs(left.count - right.count) * 8
    + teammateRepeatPenalty(a, b, history) * 1.5;
}
function balancedAllocations(
  players: RatedPlayer[], captainAId: string, captainBId: string,
  previous: Allocation, history: PairHistory,
): Allocation | null {
  const captainA = players.find(p => p.id === captainAId);
  const captainB = players.find(p => p.id === captainBId);
  if (!captainA || !captainB || captainAId === captainBId) return null;
  const others = players.filter(p => p.id !== captainAId && p.id !== captainBId);
  const alternatives = new Map<string, { allocation: Allocation; penalty: number }>();
  const previousKey = players.filter(p => previous[p.id] === "A").map(p => p.id).sort().join("|");

  for (let attempt = 0; attempt < 64; attempt++) {
    const targetA = attempt % 2 === 0 ? Math.ceil(players.length / 2) : Math.floor(players.length / 2);
    const groupA = [captainA, ...shuffle(others).slice(0, targetA - 1)];
    const groupB = [captainB, ...others.filter(p => !groupA.some(a => a.id === p.id))];
    for (let pass = 0; pass < 12; pass++) {
      let best = allocationPenalty(groupA, groupB, history);
      let ai = -1, bi = -1;
      for (let i = 1; i < groupA.length; i++) {
        for (let j = 1; j < groupB.length; j++) {
          const aa = groupA.slice(), bb = groupB.slice();
          [aa[i], bb[j]] = [bb[j], aa[i]];
          const candidate = allocationPenalty(aa, bb, history);
          if (candidate + 0.001 < best) { best = candidate; ai = i; bi = j; }
        }
      }
      if (ai === -1) break;
      [groupA[ai], groupB[bi]] = [groupB[bi], groupA[ai]];
    }
    const allocation: Allocation = {};
    groupA.forEach(p => { allocation[p.id] = "A"; });
    groupB.forEach(p => { allocation[p.id] = "B"; });
    const key = groupA.map(p => p.id).sort().join("|");
    alternatives.set(key, { allocation, penalty: allocationPenalty(groupA, groupB, history) });
  }
  const ranked = [...alternatives.entries()].sort((a, b) => a[1].penalty - b[1].penalty);
  if (!ranked.length) return null;
  const best = ranked[0][1].penalty;
  const fresh = ranked.filter(([key, value]) => key !== previousKey && value.penalty <= best + 16);
  const pool = fresh.length ? fresh.slice(0, 12) : ranked.slice(0, 1);
  return pool[Math.floor(Math.random() * pool.length)][1].allocation;
}

function readableError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function TeamBalancerPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [allocation, setAllocation] = useState<Allocation>({});
  const [swapId, setSwapId] = useState<string | null>(null);
  const [editingRatings, setEditingRatings] = useState(false);
  const [ratingEdits, setRatingEdits] = useState<Record<string, { batting: string; bowling: string }>>({});
  const [savingRatingId, setSavingRatingId] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);

  const loadSessions = useCallback(async (preferred?: string) => {
    setLoading(true);
    const { data, error } = await supabase.from("sessions").select(`
      id, session_date, session_name, team_a_name, team_b_name,
      captain_a_player_id, captain_b_player_id,
      session_players (player_id, players (id, name, batting_rating, bowling_rating)),
      session_team_players (player_id, team_side)
    `).order("session_date", { ascending: false });
    if (error) {
      setMessage(`Could not load sessions: ${error.message}. Run the setup SQL first.`);
      setLoading(false);
      return;
    }
    const next = (data || []) as unknown as Session[];
    setSessions(next);
    setSessionId(current => {
      const wanted = preferred || current;
      return next.some(s => s.id === wanted) ? wanted : (next[0]?.id || "");
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data: { user } }) => {
      setIsAdmin(user?.email?.toLowerCase() === ADMIN_EMAIL);
    });
    void loadSessions();
  }, [loadSessions]);

  const session = useMemo(() => sessions.find(s => s.id === sessionId), [sessions, sessionId]);
  const rotationHistory = useMemo(() => buildHistory(sessions, session), [sessions, session]);
  const players = useMemo(() => {
    const found = new Map<string, RatedPlayer>();
    for (const row of session?.session_players || []) {
      if (row.players) found.set(row.player_id, row.players);
    }
    return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [session]);
  const captainAId = session?.captain_a_player_id || "";
  const captainBId = session?.captain_b_player_id || "";
  const captainA = players.find(p => p.id === captainAId);
  const captainB = players.find(p => p.id === captainBId);
  const teamAName = session?.team_a_name || (captainA ? `Team ${captainA.name}` : "Team A");
  const teamBName = session?.team_b_name || (captainB ? `Team ${captainB.name}` : "Team B");
  const unrated = players.filter(p => p.batting_rating == null || p.bowling_rating == null);
  const assignedCount = players.filter(p => allocation[p.id] === "A" || allocation[p.id] === "B").length;
  const teamA = players.filter(p => allocation[p.id] === "A");
  const teamB = players.filter(p => allocation[p.id] === "B");
  const statsA = totals(teamA), statsB = totals(teamB);
  const captainsReady = !!captainA && !!captainB && captainA.id !== captainB.id;
  const canBalance = isAdmin && captainsReady && unrated.length === 0 && players.length >= 2;

  useEffect(() => {
    const saved: Allocation = {};
    (session?.session_team_players || []).forEach(row => { saved[row.player_id] = row.team_side; });
    setAllocation(saved);
    setChanged(false);
    setSwapId(null);
    setMessage("");
    const edits: Record<string, { batting: string; bowling: string }> = {};
    (session?.session_players || []).forEach(row => {
      if (row.players) edits[row.player_id] = {
        batting: row.players.batting_rating == null ? "" : String(row.players.batting_rating),
        bowling: row.players.bowling_rating == null ? "" : String(row.players.bowling_rating),
      };
    });
    setRatingEdits(edits);
  }, [session]);

  function generate() {
    if (!canBalance) return;
    const next = balancedAllocations(players, captainAId, captainBId, allocation, rotationHistory.pairs);
    if (!next) { setMessage("Unable to balance these teams."); return; }
    setAllocation(next);
    setSwapId(null);
    setChanged(true);
    setMessage("New balanced teams ready. Review or swap players, then tap Save Teams.");
  }

  function selectSwap(player: RatedPlayer) {
    if (!isAdmin || !changed || player.id === captainAId || player.id === captainBId) return;
    if (!swapId) { setSwapId(player.id); return; }
    if (swapId === player.id) { setSwapId(null); return; }
    if (allocation[swapId] === allocation[player.id]) {
      setSwapId(player.id);
      setMessage("Select someone on the other team to swap with.");
      return;
    }
    setAllocation(old => ({ ...old, [swapId]: old[player.id], [player.id]: old[swapId] }));
    setSwapId(null);
    setMessage("Players swapped. Tap Save Teams when finished.");
  }

  async function saveTeams() {
    if (!session || !canBalance || !changed || assignedCount !== players.length) return;
    if (Math.abs(teamA.length - teamB.length) > 1) { setMessage("Team sizes must differ by no more than one player."); return; }
    if (allocation[captainAId] !== "A" || allocation[captainBId] !== "B") {
      setMessage("Captains must remain in their own teams."); return;
    }
    if ((session.session_team_players?.length || 0) > 0 && !window.confirm(
      `Replace the saved team assignments for ${dateLabel(session.session_date)}? This will not change match scores.`
    )) return;
    setSaving(true);
    setMessage("");
    const rows = players.map(p => ({ player_id: p.id, team_side: allocation[p.id] }));
    const { error } = await supabase.rpc("save_balanced_session_teams", {
      p_session_id: session.id,
      p_assignments: rows,
    });
    setSaving(false);
    if (error) { setMessage(`Save failed: ${error.message}`); return; }
    await loadSessions(session.id);
    setMessage("Teams saved successfully to this session.");
  }

  async function saveRating(player: RatedPlayer) {
    if (!isAdmin) return;
    const edit = ratingEdits[player.id];
    const batting = Number(edit?.batting), bowling = Number(edit?.bowling);
    if (!Number.isInteger(batting) || !Number.isInteger(bowling) || batting < 1 || batting > 5 || bowling < 1 || bowling > 5) {
      setMessage("Use whole-number batting and bowling ratings from 1 to 5."); return;
    }
    setSavingRatingId(player.id);
    const { error } = await supabase.from("players")
      .update({ batting_rating: batting, bowling_rating: bowling })
      .eq("id", player.id);
    setSavingRatingId(null);
    if (error) { setMessage(`Could not save rating for ${player.name}: ${error.message}`); return; }
    await loadSessions(sessionId);
    setMessage(`${player.name}'s rating saved.`);
  }

  const pill = "rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm";
  return (
    <main className="min-h-screen bg-slate-950 px-3 py-5 text-white sm:px-6">
      <div className="mx-auto max-w-4xl pb-32">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-extrabold sm:text-3xl">⚖️ Auto Team Balancer</h1>
            <p className="mt-1 text-sm text-slate-400">Balanced strength • Rotate previous teammates • Mobile first</p>
          </div>
          <Link href="/" className="shrink-0 rounded-xl border border-slate-700 px-3 py-2 text-sm">← Home</Link>
        </div>

        <section className="mt-5 rounded-2xl border border-slate-700 bg-slate-900 p-4">
          <label htmlFor="balancer-session" className="mb-2 block text-sm font-semibold">1. Choose session</label>
          <select id="balancer-session" className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-4 text-base"
            value={sessionId} disabled={loading} onChange={e => setSessionId(e.target.value)}>
            {sessions.map((s, index) => (
              <option key={s.id} value={s.id}>{dateLabel(s.session_date)} — {s.session_name}{index === 0 ? " (Latest)" : ""}</option>
            ))}
          </select>
          {session && <p className="mt-2 text-sm text-slate-400">{players.length} session players • Captains fixed • {rotationHistory.sessionsUsed} earlier sessions used for rotation</p>}
          {loading && <p className="mt-3 text-slate-300">Loading sessions...</p>}
        </section>

        {session && <>
          <section className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-blue-800 bg-blue-950/50 p-3">
              <div className="text-xs text-blue-300">TEAM A • CAPTAIN</div>
              <div className="mt-1 break-words text-lg font-bold">{captainA?.name || "Not selected"}</div>
              <div className="mt-1 truncate text-xs text-slate-300">{teamAName}</div>
            </div>
            <div className="rounded-2xl border border-red-800 bg-red-950/40 p-3">
              <div className="text-xs text-red-300">TEAM B • CAPTAIN</div>
              <div className="mt-1 break-words text-lg font-bold">{captainB?.name || "Not selected"}</div>
              <div className="mt-1 truncate text-xs text-slate-300">{teamBName}</div>
            </div>
          </section>

          {!captainsReady && <div className="mt-3 rounded-xl border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-200">
            Select two different captains in this session's Team Setup first. Captains must also be registered session players.
            <Link className="ml-2 underline" href={`/sessions/${session.id}`}>Open Session →</Link>
          </div>}

          <section className="mt-4 rounded-2xl bg-slate-900 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-lg font-bold">2. Player strength</h2>
                <p className="text-xs text-slate-400">Batting + Bowling, each rated 1–5</p></div>
              <div className="flex gap-2">
                <Link href="/player-ratings" className={pill}>All ratings ↗</Link>
                <button type="button" className={pill} onClick={() => setEditingRatings(old => !old)}>
                  {editingRatings ? "Hide" : "Quick edit"}
                </button>
              </div>
            </div>
            {unrated.length > 0 && <p className="mt-3 rounded-lg bg-amber-950/40 p-3 text-sm text-amber-200">
              {unrated.length} session player(s) missing ratings: {unrated.map(p => p.name).join(", ")}.
              <Link href="/player-ratings" className="ml-1 font-bold underline">Set ratings →</Link>
            </p>}
            {editingRatings && <div className="mt-4 space-y-2">
              {players.map(p => <div key={p.id} className="grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_auto] items-center gap-2 rounded-xl bg-slate-800 p-2">
                <span className="min-w-0 truncate text-sm font-medium">{p.name}</span>
                <label className="text-center text-xs text-slate-400">Bat
                  <input aria-label={`${p.name} batting rating`} type="number" min="1" max="5" inputMode="numeric"
                    disabled={!isAdmin} value={ratingEdits[p.id]?.batting ?? ""}
                    onChange={e => setRatingEdits(old => ({ ...old, [p.id]: { batting: e.target.value, bowling: old[p.id]?.bowling || "" } }))}
                    className="mt-1 w-full rounded-lg bg-slate-700 p-2 text-center text-base text-white" />
                </label>
                <label className="text-center text-xs text-slate-400">Bowl
                  <input aria-label={`${p.name} bowling rating`} type="number" min="1" max="5" inputMode="numeric"
                    disabled={!isAdmin} value={ratingEdits[p.id]?.bowling ?? ""}
                    onChange={e => setRatingEdits(old => ({ ...old, [p.id]: { batting: old[p.id]?.batting || "", bowling: e.target.value } }))}
                    className="mt-1 w-full rounded-lg bg-slate-700 p-2 text-center text-base text-white" />
                </label>
                <button type="button" disabled={!isAdmin || savingRatingId === p.id} onClick={() => void saveRating(p)}
                  className="rounded-lg bg-green-600 px-2 py-3 text-xs font-bold text-white disabled:opacity-40">{savingRatingId === p.id ? "..." : "Save"}</button>
              </div>)}
            </div>}
            {!isAdmin && <p className="mt-2 text-xs text-slate-400">Sign in as admin to generate or save teams.</p>}
          </section>

          <section className="mt-4 rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-slate-300">
            <p className="font-bold text-white">🔁 Rotate teams using earlier sessions</p>
            <p className="mt-1">We check up to 12 sessions before {session.session_date}. Players who were teammates recently get a higher repeat penalty, while batting, bowling and team size stay balanced.</p>
            {rotationHistory.sessionsUsed === 0 && <p className="mt-2 text-amber-300">No earlier saved team allocations yet — balancing will use player ratings only.</p>}
            <Link href={`/team-history?session=${session.id}`} className="mt-2 inline-block font-semibold text-sky-300 underline">View dated team history →</Link>
          </section>
          <button type="button" onClick={generate} disabled={!canBalance || saving}
            className="mt-4 min-h-14 w-full rounded-2xl bg-green-500 px-4 py-4 text-lg font-extrabold text-slate-950 shadow-lg disabled:opacity-40">
            {assignedCount ? "🔀 Regenerate Balanced Teams" : "⚡ Generate Balanced Teams"}
          </button>

          <section className="mt-4 grid grid-cols-2 gap-3">
            {(["A", "B"] as const).map(side => {
              const members = side === "A" ? teamA : teamB;
              const t = side === "A" ? statsA : statsB;
              const capId = side === "A" ? captainAId : captainBId;
              return <div key={side} className={`min-w-0 overflow-hidden rounded-2xl border p-2 sm:p-4 ${side === "A" ? "border-blue-700 bg-blue-950/30" : "border-red-700 bg-red-950/30"}`}>
                <h3 className="truncate font-bold">{side === "A" ? teamAName : teamBName}</h3>
                <div className="mt-1 text-xs text-slate-300">{t.count} players</div>
                <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-slate-900 p-2 text-center">
                  <div><div className="text-xs text-slate-400">Batting</div><div className="text-xl font-bold">{t.bat}</div></div>
                  <div><div className="text-xs text-slate-400">Bowling</div><div className="text-xl font-bold">{t.bowl}</div></div>
                  <div className="col-span-2 text-sm font-semibold text-green-300">Total {t.overall}</div>
                </div>
                <div className="mt-3 space-y-2">
                  {members.map(p => <button type="button" key={p.id}
                    disabled={!changed || !isAdmin || p.id === capId}
                    onClick={() => selectSwap(p)}
                    className={`flex min-h-12 w-full items-center justify-between gap-1 rounded-xl border px-2 py-2 text-left disabled:cursor-default ${swapId === p.id ? "border-yellow-400 bg-yellow-900/30" : "border-slate-700 bg-slate-900"}`}>
                    <span className="min-w-0 break-words text-xs font-medium sm:text-sm">{p.id === capId ? "👑 " : ""}{p.name}</span>
                    <span className="shrink-0 rounded-lg bg-slate-800 px-1.5 py-1 text-xs">{Number(p.batting_rating) + Number(p.bowling_rating)}</span>
                  </button>)}
                  {!members.length && <p className="py-4 text-center text-xs text-slate-400">Not assigned yet</p>}
                </div>
              </div>;
            })}
          </section>
          {assignedCount > 0 && <div className="mt-3 rounded-xl bg-slate-900 p-3 text-sm text-slate-300">
            <div className="flex flex-wrap justify-between gap-2">
              <span>Batting difference: <b>{Math.abs(statsA.bat - statsB.bat)}</b></span>
              <span>Bowling difference: <b>{Math.abs(statsA.bowl - statsB.bowl)}</b></span>
            </div>
            <p className="mt-2 text-xs text-slate-400">Historical teammate penalty: <b>{teammateRepeatPenalty(teamA, teamB, rotationHistory.pairs).toFixed(0)}</b> (lower means more rotation). {changed ? "Tap any non-captain player, then someone on the opposite team, to swap." : "Generate a new balanced lineup to edit."}</p>
            {swapId && <button onClick={() => setSwapId(null)} className="mt-2 text-yellow-300 underline">Cancel swap</button>}
          </div>}
          {message && <div aria-live="polite" className="mt-4 rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-yellow-100">{message}</div>}
          <div className="sticky bottom-2 z-10 mt-4 rounded-2xl border border-slate-600 bg-slate-950/95 p-3 shadow-2xl backdrop-blur">
            <button type="button" onClick={() => void saveTeams()}
              disabled={!canBalance || !changed || saving || assignedCount !== players.length}
              className="min-h-14 w-full rounded-xl bg-blue-500 px-4 py-3 text-lg font-extrabold text-white disabled:opacity-40">
              {saving ? "Saving..." : "💾 Save Teams to Session"}
            </button>
          </div>
          <p className="mt-4 text-center text-xs text-slate-400">Saves to existing session team assignments. Scores and payments are not changed.</p>
        </>}
        {!loading && sessions.length === 0 && <div className="mt-5 rounded-xl bg-slate-900 p-4">No sessions found.</div>}
      </div>
    </main>
  );
}
