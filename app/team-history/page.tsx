"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { supabase } from "../../lib/supabase";

type Side = "A" | "B";
type Person = { id: string; name: string };
type Member = { player_id: string; players: Person | null };
type TeamRow = { player_id: string; team_side: Side };
type SessionRow = {
  id: string; session_name: string; session_date: string;
  team_a_name: string | null; team_b_name: string | null;
  captain_a_player_id: string | null; captain_b_player_id: string | null;
  session_players: Member[]; session_team_players: TeamRow[];
};
type Version = { id: string; session_id: string; saved_at: string; source: string; assignments: unknown };
function formatDate(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {weekday:"short", day:"numeric", month:"short", year:"numeric"});
}
function TeamHistoryInner() {
  const query = useSearchParams();
  const initialSessionId = query.get("session") || "";
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [playerId, setPlayerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [versions, setVersions] = useState<Version[]>([]);
  const [versionsError, setVersionsError] = useState("");
  useEffect(() => {
    void (async () => {
      const { data, error: err } = await supabase.from("sessions").select(`
        id,session_date,session_name,team_a_name,team_b_name,captain_a_player_id,captain_b_player_id,
        session_players(player_id,players(id,name)),session_team_players(player_id,team_side)
      `).order("session_date", {ascending: false});
      if (err) setError(err.message);
      else {
        const next = (data || []) as unknown as SessionRow[];
        setSessions(next);
        setSessionId(current => next.some(s => s.id === current) ? current : (next[0]?.id || ""));
      }
      setLoading(false);
    })();
    void (async () => {
      const { data, error: err } = await supabase.from("session_team_save_history")
        .select("id,session_id,saved_at,source,assignments").order("saved_at", {ascending:false}).limit(300);
      if (err) setVersionsError("Saved-version archive unavailable. Run the team history SQL setup.");
      else setVersions((data || []) as Version[]);
    })();
  }, []);
  const selected = sessions.find(s => s.id === sessionId);
  const people = useMemo(() => {
    const map = new Map<string,string>();
    sessions.forEach(s => s.session_players.forEach(sp => { if (sp.players) map.set(sp.player_id, sp.players.name); }));
    return [...map.entries()].map(([id,name]) => ({id,name})).sort((a,b) => a.name.localeCompare(b.name));
  }, [sessions]);
  const nameOf = (id: string) => people.find(p => p.id === id)?.name || "Unknown player";
  const history = useMemo(() => sessions.filter(s => s.session_players.some(row => row.player_id === playerId)), [sessions, playerId]);
  const visibleVersions = versions.filter(v => v.session_id === sessionId);
  const itemClass = "rounded-xl border border-slate-700 bg-slate-800 px-3 py-3";
  return <main className="min-h-screen bg-slate-950 px-3 py-5 text-white sm:px-6">
    <div className="mx-auto max-w-3xl pb-16">
      <header className="flex items-center justify-between gap-2">
        <div><h1 className="text-2xl font-black">📅 Team History</h1>
          <p className="mt-1 text-sm text-slate-400">Who played, on what date, under which captain</p></div>
        <Link href="/" className="rounded-xl border border-slate-600 px-3 py-3 text-sm">← Home</Link>
      </header>
      {loading && <p className="mt-5">Loading team history…</p>}
      {error && <p className="mt-5 text-red-300">{error}</p>}
      {!loading && <>
        <section className="mt-5 rounded-2xl bg-slate-900 p-4">
          <h2 className="font-bold">View by session date</h2>
          <select value={sessionId} onChange={e => setSessionId(e.target.value)}
            className="mt-2 min-h-14 w-full rounded-xl border border-slate-600 bg-slate-800 px-3 text-base">
            {sessions.map(s => <option value={s.id} key={s.id}>{formatDate(s.session_date)} — {s.session_name}</option>)}
          </select>
          {selected && <>
            <p className="mt-2 text-sm text-slate-400">{selected.session_players.length} registered players · {selected.session_team_players.length} assigned</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {(["A","B"] as Side[]).map(side => {
                const capId = side === "A" ? selected.captain_a_player_id : selected.captain_b_player_id;
                const teamName = side === "A" ? selected.team_a_name : selected.team_b_name;
                const members = selected.session_team_players.filter(row => row.team_side === side);
                return <div key={side} className={`min-w-0 rounded-xl border p-2 sm:p-3 ${side === "A" ? "border-blue-700 bg-blue-950/30" : "border-red-700 bg-red-950/30"}`}>
                  <div className="truncate font-bold">{teamName || `Team ${side}`}</div>
                  <div className="mt-1 text-xs text-slate-300">👑 {capId ? nameOf(capId) : "Captain not selected"}</div>
                  <div className="mt-2 space-y-2">
                    {members.map(row => <div key={row.player_id} className="break-words rounded-lg bg-slate-900 p-2 text-sm">{row.player_id === capId ? "👑 " : ""}{nameOf(row.player_id)}</div>)}
                    {members.length === 0 && <p className="text-xs text-slate-400">No saved team members</p>}
                  </div>
                </div>;
              })}
            </div>
            {selected.session_players.some(sp => !selected.session_team_players.some(row => row.player_id === sp.player_id)) &&
              <div className="mt-3 rounded-xl border border-slate-700 p-3 text-sm">
                <p className="font-bold">Not yet assigned</p>
                <p className="mt-1 text-slate-300">{selected.session_players.filter(sp => !selected.session_team_players.some(row => row.player_id === sp.player_id)).map(sp => sp.players?.name || "Unknown").join(" · ")}</p>
              </div>}
            <details className="mt-3 rounded-xl border border-slate-700 p-3 text-sm">
              <summary className="cursor-pointer font-semibold">Saved versions ({visibleVersions.length})</summary>
              <p className="mt-2 text-xs text-slate-400">Earlier versions remain archived when a session's team assignments change. Imported records preserve the session date, but their original save time is unknown.</p>
              {visibleVersions.map(v => <div key={v.id} className="mt-2 rounded-lg bg-slate-800 p-2">
                {v.source === "imported" ? "Imported previous assignment" : "Saved teams"} · {new Date(v.saved_at).toLocaleString("en-IN")}
              </div>)}
              {versionsError && <p className="mt-2 text-amber-300">{versionsError}</p>}
            </details>
          </>}
        </section>
        <section className="mt-4 rounded-2xl bg-slate-900 p-4">
          <h2 className="font-bold">View history for one player</h2>
          <select value={playerId} onChange={e => setPlayerId(e.target.value)}
            className="mt-2 min-h-14 w-full rounded-xl border border-slate-600 bg-slate-800 px-3 text-base">
            <option value="">Select player</option>
            {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {playerId && <div className="mt-3 space-y-2">
            <p className="text-sm text-slate-400">{history.length} sessions attended (based on session registrations)</p>
            {history.map(s => {
              const side = s.session_team_players.find(row => row.player_id === playerId)?.team_side;
              const captainId = side === "A" ? s.captain_a_player_id : side === "B" ? s.captain_b_player_id : null;
              const teamName = side === "A" ? s.team_a_name : side === "B" ? s.team_b_name : null;
              return <div className={itemClass} key={s.id}>
                <div className="font-semibold">{formatDate(s.session_date)}</div>
                <div className="mt-1 text-sm text-slate-300">{side ? `${teamName || `Team ${side}`} · Captain: ${captainId ? nameOf(captainId) : "Not selected"}` : "Registered · Team not assigned"}</div>
              </div>;
            })}
          </div>}
        </section>
        <div className="mt-5 grid grid-cols-2 gap-3 text-center text-sm font-bold">
          <Link href="/team-balancer" className="rounded-xl bg-green-600 px-3 py-4">⚖️ Team Balancer</Link>
          <Link href="/player-ratings" className="rounded-xl border border-slate-600 px-3 py-4">⭐ Player Ratings</Link>
        </div>
      </>}
    </div>
  </main>;
}
export default function TeamHistoryPage() {
  return <Suspense fallback={<main className="min-h-screen bg-slate-950 p-5 text-white">Loading…</main>}>
    <TeamHistoryInner/>
  </Suspense>;
}
