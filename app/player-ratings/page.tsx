"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

const ADMIN_EMAIL = "kashifanisahmedbaksh3@gmail.com";
type Player = {
  id: string;
  name: string;
  mobile: string | null;
  is_active: boolean;
  batting_rating: number | null;
  bowling_rating: number | null;
};
type Edit = { batting: string; bowling: string };
const ratingOptions = [1, 2, 3, 4, 5];
function parseRating(value: string): number | null {
  const n = Number(value);
  return /^\d$/.test(value) && Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}
function RatingSelect({ label, value, onChange, disabled }: {
  label: string; value: string; onChange: (value: string) => void; disabled?: boolean;
}) {
  return <label className="flex min-w-0 flex-col gap-1 text-xs text-slate-400">
    {label}
    <select aria-label={label} value={value} disabled={disabled}
      onChange={e => onChange(e.target.value)}
      className="min-h-12 w-full rounded-xl border border-slate-600 bg-slate-800 px-2 text-center text-base text-white">
      <option value="">—</option>
      {ratingOptions.map(n => <option key={n} value={n}>{n}</option>)}
    </select>
  </label>;
}

export default function PlayerRatingsPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [onlyUnrated, setOnlyUnrated] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [newName, setNewName] = useState("");
  const [newMobile, setNewMobile] = useState("");
  const [newBatting, setNewBatting] = useState("");
  const [newBowling, setNewBowling] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("players")
      .select("id,name,mobile,is_active,batting_rating,bowling_rating").order("name");
    setLoading(false);
    if (error) { setMessage(`Cannot load players: ${error.message}. Run the setup SQL first.`); return; }
    const next = (data || []) as Player[];
    setPlayers(next);
    setEdits(Object.fromEntries(next.map(p => [p.id, {
      batting: p.batting_rating == null ? "" : String(p.batting_rating),
      bowling: p.bowling_rating == null ? "" : String(p.bowling_rating),
    }])));
  }, []);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data: { user } }) => {
      setIsAdmin(user?.email?.toLowerCase() === ADMIN_EMAIL);
    });
    void load();
  }, [load]);

  const visible = useMemo(() => players.filter(p => {
    if (!showInactive && !p.is_active) return false;
    if (onlyUnrated && p.batting_rating != null && p.bowling_rating != null) return false;
    return p.name.toLowerCase().includes(query.toLowerCase().trim());
  }), [players, showInactive, onlyUnrated, query]);
  const missing = players.filter(p => p.is_active && (p.batting_rating == null || p.bowling_rating == null)).length;

  async function saveRating(player: Player) {
    if (!isAdmin || savingId) return;
    const edit = edits[player.id];
    const batting = parseRating(edit?.batting ?? "");
    const bowling = parseRating(edit?.bowling ?? "");
    if (batting === null || bowling === null) {
      setMessage(`${player.name}: choose batting and bowling ratings from 1 to 5.`); return;
    }
    setSavingId(player.id); setMessage("");
    const { error } = await supabase.from("players")
      .update({ batting_rating: batting, bowling_rating: bowling }).eq("id", player.id);
    setSavingId(null);
    if (error) { setMessage(`Could not update ${player.name}: ${error.message}`); return; }
    setPlayers(old => old.map(p => p.id === player.id ? { ...p, batting_rating: batting, bowling_rating: bowling } : p));
    setMessage(`${player.name}: saved ${batting} batting + ${bowling} bowling = ${batting + bowling}.`);
  }

  async function addPlayer() {
    if (!isAdmin || adding) return;
    const name = newName.trim().replace(/\s+/g, " ");
    const batting = parseRating(newBatting), bowling = parseRating(newBowling);
    if (!name) { setMessage("Enter the new player's name."); return; }
    if (batting === null || bowling === null) {
      setMessage("Choose batting and bowling ratings for the new player first."); return;
    }
    if (players.some(p => p.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setMessage(`${name} already exists. Search for the player below and update their ratings instead.`);
      setQuery(name); return;
    }
    setAdding(true); setMessage("");
    const { error } = await supabase.from("players").insert({
      name, mobile: newMobile.trim() || null, is_active: true,
      batting_rating: batting, bowling_rating: bowling,
    });
    setAdding(false);
    if (error) { setMessage(`Could not add player: ${error.message}`); return; }
    setNewName(""); setNewMobile(""); setNewBatting(""); setNewBowling("");
    await load();
    setMessage(`${name} added with rating ${batting + bowling}. Add them to any session from that session's Players section.`);
  }

  return <main className="min-h-screen bg-slate-950 px-3 py-5 text-white sm:px-6">
    <div className="mx-auto max-w-3xl pb-20">
      <div className="flex items-center justify-between gap-3">
        <div><h1 className="text-2xl font-black sm:text-3xl">⭐ Player Ratings</h1>
          <p className="mt-1 text-sm text-slate-400">Batting 1–5 + Bowling 1–5 = Overall 2–10</p></div>
        <Link href="/" className="shrink-0 rounded-xl border border-slate-600 px-3 py-3 text-sm">← Home</Link>
      </div>
      {message && <div role="status" className="mt-4 rounded-xl border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-100">{message}</div>}
      {!isAdmin && <p className="mt-4 rounded-xl bg-slate-900 p-3 text-sm text-amber-200">Sign in as admin to add players and change ratings.</p>}

      <section className="mt-5 rounded-2xl border border-slate-700 bg-slate-900 p-4">
        <h2 className="text-lg font-bold">➕ Add player with ratings</h2>
        <p className="mt-1 text-xs text-slate-400">Creating a player here saves both skill ratings immediately. No default guess.</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="col-span-2 text-xs text-slate-300">Player name
            <input value={newName} onChange={e => setNewName(e.target.value)} disabled={!isAdmin}
              placeholder="New player's name" className="mt-1 min-h-12 w-full rounded-xl border border-slate-600 bg-slate-800 px-3 text-base text-white" />
          </label>
          <label className="col-span-2 text-xs text-slate-300">Mobile (optional)
            <input value={newMobile} onChange={e => setNewMobile(e.target.value)} disabled={!isAdmin} type="tel"
              placeholder="Mobile number" className="mt-1 min-h-12 w-full rounded-xl border border-slate-600 bg-slate-800 px-3 text-base text-white" />
          </label>
          <RatingSelect label="Batting" value={newBatting} disabled={!isAdmin} onChange={setNewBatting}/>
          <RatingSelect label="Bowling" value={newBowling} disabled={!isAdmin} onChange={setNewBowling}/>
        </div>
        <button onClick={() => void addPlayer()} disabled={!isAdmin || adding}
          className="mt-4 min-h-14 w-full rounded-xl bg-green-500 p-3 text-base font-extrabold text-slate-950 disabled:opacity-40">
          {adding ? "Adding…" : "Add Player + Ratings"}
        </button>
      </section>

      <section className="mt-4 rounded-2xl border border-slate-700 bg-slate-900 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold">All player ratings</h2>
          <span className="text-xs text-amber-300">{missing} active unrated</span>
        </div>
        <input value={query} onChange={e => setQuery(e.target.value)} type="search" placeholder="🔎 Search players"
          className="mt-3 min-h-12 w-full rounded-xl border border-slate-600 bg-slate-800 px-3 text-base" />
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <label><input type="checkbox" className="mr-2" checked={onlyUnrated} onChange={e => setOnlyUnrated(e.target.checked)}/>Only missing ratings</label>
          <label><input type="checkbox" className="mr-2" checked={showInactive} onChange={e => setShowInactive(e.target.checked)}/>Include inactive</label>
        </div>
        <div className="mt-4 space-y-3">
          {loading && <p className="text-slate-400">Loading players…</p>}
          {!loading && visible.length === 0 && <p className="text-slate-400">No matching players.</p>}
          {visible.map(p => <div key={p.id} className="rounded-xl border border-slate-700 bg-slate-800 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-semibold">{p.name}</span>
              <span className={`shrink-0 rounded-lg px-3 py-1 text-sm font-bold ${p.batting_rating == null || p.bowling_rating == null ? "bg-amber-950 text-amber-300" : "bg-green-950 text-green-300"}`}>
                {p.batting_rating != null && p.bowling_rating != null ? `${p.batting_rating + p.bowling_rating}/10` : "Unrated"}
              </span>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
              <RatingSelect label="Batting" disabled={!isAdmin || savingId !== null}
                value={edits[p.id]?.batting ?? ""}
                onChange={value => setEdits(old => ({...old, [p.id]: {...old[p.id], batting: value}}))}/>
              <RatingSelect label="Bowling" disabled={!isAdmin || savingId !== null}
                value={edits[p.id]?.bowling ?? ""}
                onChange={value => setEdits(old => ({...old, [p.id]: {...old[p.id], bowling: value}}))}/>
              <button onClick={() => void saveRating(p)} disabled={!isAdmin || savingId !== null ||
                (edits[p.id]?.batting === String(p.batting_rating ?? "") && edits[p.id]?.bowling === String(p.bowling_rating ?? ""))}
                className="min-h-12 rounded-xl bg-blue-600 px-4 text-sm font-bold disabled:opacity-40">{savingId === p.id ? "…" : "Save"}</button>
            </div>
          </div>)}
        </div>
      </section>
      <div className="mt-5 grid grid-cols-2 gap-3 text-center text-sm font-bold">
        <Link href="/team-balancer" className="rounded-xl bg-blue-600 px-3 py-4">⚖️ Balance teams</Link>
        <Link href="/team-history" className="rounded-xl border border-slate-600 px-3 py-4">📅 Team history</Link>
      </div>
    </div>
  </main>;
}
