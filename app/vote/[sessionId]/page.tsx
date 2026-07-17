"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";

type Player = { id: string; name: string };
type Vote = { id: string; player_id: string; vote: "yes" | "no" | "maybe" };
type SessionData = {
  id: string;
  session_name: string;
  session_date: string;
  voting_enabled: boolean;
  voting_status: "draft" | "open" | "closed" | "converted";
  voting_deadline: string | null;
  venue_note: string | null;
  turfs: { id: string; name: string; location: string | null } | null;
};

export default function VotingPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;

  const [session, setSession] = useState<SessionData | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyPlayerId, setBusyPlayerId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminBusy, setAdminBusy] = useState(false);
  const [search, setSearch] = useState("");

  async function loadAdminStatus() {
    const { data: { user } } = await supabase.auth.getUser();
    setIsAdmin(
      user?.email?.toLowerCase() === "kashifanisahmedbaksh3@gmail.com"
    );
  }

  async function loadVotingData(showLoader = false) {
    if (showLoader) setLoading(true);

    const [sessionResult, playerResult, voteResult] = await Promise.all([
      supabase
        .from("sessions")
        .select(`
          id,
          session_name,
          session_date,
          voting_enabled,
          voting_status,
          voting_deadline,
          venue_note,
          turfs (id,name,location)
        `)
        .eq("id", sessionId)
        .single(),
      supabase
        .from("players")
        .select("id,name")
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("session_votes")
        .select("id,player_id,vote")
        .eq("session_id", sessionId),
    ]);

    if (sessionResult.error) {
        alert(sessionResult.error.message);
        setSession(null);
      } else {
        setSession(sessionResult.data as unknown as SessionData);
      }
    if (playerResult.error) alert(playerResult.error.message);
    else setPlayers(playerResult.data || []);

    if (voteResult.error) alert(voteResult.error.message);
    else setVotes((voteResult.data || []) as Vote[]);

    setLoading(false);
  }

  useEffect(() => {
    loadAdminStatus();
    loadVotingData(true);

    const channel = supabase
      .channel(`session-votes-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "session_votes",
          filter: `session_id=eq.${sessionId}`,
        },
        () => loadVotingData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const confirmedPlayerIds = useMemo(
    () =>
      new Set(
        votes.filter((vote) => vote.vote === "yes").map((vote) => vote.player_id)
      ),
    [votes]
  );

  const confirmedPlayers = useMemo(
    () => players.filter((player) => confirmedPlayerIds.has(player.id)),
    [players, confirmedPlayerIds]
  );

  const waitingPlayers = useMemo(
    () => players.filter((player) => !confirmedPlayerIds.has(player.id)),
    [players, confirmedPlayerIds]
  );

  const filteredPlayers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return players;
    return players.filter((player) => player.name.toLowerCase().includes(query));
  }, [players, search]);

  const confirmedCount = confirmedPlayers.length;
  const totalPlayers = players.length;
  const waitingCount = Math.max(totalPlayers - confirmedCount, 0);
  const confirmedPercent =
    totalPlayers > 0 ? Math.round((confirmedCount / totalPlayers) * 100) : 0;

  const votingOpen =
    session?.voting_enabled === true && session?.voting_status === "open";
  const deadlinePassed =
    Boolean(session?.voting_deadline) &&
    new Date(session!.voting_deadline!).getTime() < Date.now();

  async function toggleVote(player: Player) {
    if (!votingOpen || deadlinePassed) {
      alert("Voting is closed.");
      return;
    }

    setBusyPlayerId(player.id);
    const nextVote = confirmedPlayerIds.has(player.id) ? "no" : "yes";

    const { error } = await supabase.from("session_votes").upsert(
      {
        session_id: sessionId,
        player_id: player.id,
        vote: nextVote,
        voted_at: new Date().toISOString(),
      },
      { onConflict: "session_id,player_id" }
    );

    setBusyPlayerId(null);
    if (error) {
      alert(error.message);
      return;
    }
    await loadVotingData();
  }

  async function shareVotingLink() {
    const url = window.location.href;
    const text = `🏏 ${session?.session_name || "Sunday Cricket"}

${formatDate(session?.session_date)}
📍 ${session?.turfs?.name || "Venue to be confirmed"}

✅ Confirmed: ${confirmedCount}
⏳ Waiting: ${waitingCount}

Tap your name and view the live voting chart:
${url}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: session?.session_name || "Cricket Voting",
          text,
          url,
        });
        return;
      } catch {}
    }

    await navigator.clipboard.writeText(text);
    alert("Voting message copied. Paste it in your WhatsApp group.");
  }

  async function closeVoting() {
    if (!isAdmin) return;
    if (!confirm("Close voting? Players will no longer be able to change their selection.")) return;

    setAdminBusy(true);
    const { error } = await supabase
      .from("sessions")
      .update({ voting_enabled: false, voting_status: "closed" })
      .eq("id", sessionId);
    setAdminBusy(false);

    if (error) {
      alert(error.message);
      return;
    }
    await loadVotingData();
  }

  async function importConfirmedPlayers() {
    if (!isAdmin) return;
    if (confirmedPlayerIds.size === 0) {
      alert("No confirmed players are available.");
      return;
    }

    setAdminBusy(true);

    const { data: existingRows, error: existingError } = await supabase
      .from("session_players")
      .select("player_id")
      .eq("session_id", sessionId);

    if (existingError) {
      setAdminBusy(false);
      alert(existingError.message);
      return;
    }

    const existingIds = new Set((existingRows || []).map((row) => row.player_id));
    const rows = Array.from(confirmedPlayerIds)
      .filter((playerId) => !existingIds.has(playerId))
      .map((playerId) => ({
        session_id: sessionId,
        player_id: playerId,
        amount_paid: 0,
        payment_method: null,
      }));

    if (rows.length > 0) {
      const { error: insertError } = await supabase
        .from("session_players")
        .insert(rows);
      if (insertError) {
        setAdminBusy(false);
        alert(insertError.message);
        return;
      }
    }

    const { error: sessionError } = await supabase
      .from("sessions")
      .update({ voting_enabled: false, voting_status: "converted" })
      .eq("id", sessionId);

    setAdminBusy(false);
    if (sessionError) {
      alert(sessionError.message);
      return;
    }

    alert(`${confirmedCount} confirmed player${confirmedCount === 1 ? "" : "s"} added to the session.`);
    window.location.href = `/sessions/${sessionId}`;
  }

  if (loading) {
    return <main className="min-h-screen bg-slate-950 p-6 text-white">Loading voting page...</main>;
  }

  if (!session) {
    return <main className="min-h-screen bg-slate-950 p-6 text-white">Voting session not found.</main>;
  }

  return (
    <main className="min-h-screen bg-slate-950 p-5 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <a href="/" className="text-sm text-slate-400">← Cricket Hub</a>
          <button
            type="button"
            onClick={shareVotingLink}
            className="rounded-xl bg-green-500 px-4 py-2 font-semibold text-slate-950"
          >
            📲 Share on WhatsApp
          </button>
        </div>

        <section className="mt-6 overflow-hidden rounded-3xl border border-slate-800 bg-slate-900">
          <div className="bg-gradient-to-br from-green-500/20 via-slate-900 to-blue-500/10 p-6 md:p-8">
            <p className="text-sm font-semibold uppercase tracking-wider text-green-300">Public Player Voting</p>
            <h1 className="mt-2 text-4xl font-black">🏏 {session.session_name}</h1>
            <p className="mt-3 text-lg text-slate-200">{formatDate(session.session_date)}</p>

            <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-950/60 p-5">
              <p className="text-sm text-slate-400">Proposed Venue</p>
              <p className="mt-1 text-2xl font-bold">📍 {session.turfs?.name || "Venue to be confirmed"}</p>
              {session.turfs?.location && <p className="mt-1 text-sm text-slate-400">{session.turfs.location}</p>}
              {session.venue_note && <p className="mt-3 text-sm text-yellow-200">🌧️ {session.venue_note}</p>}
            </div>

            {!votingOpen || deadlinePassed ? (
              <div className="mt-5 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-yellow-200">Voting is closed. Confirmed players are shown below.</div>
            ) : (
              <div className="mt-5 rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-green-200">Tap your own name once to confirm. Tap again to withdraw.</div>
            )}
          </div>
        </section>

        <section className="mt-6 grid gap-5 md:grid-cols-[240px_1fr]">
          <div className="rounded-3xl bg-slate-900 p-6">
            <div className="flex justify-center">
              <div
                className="relative flex h-44 w-44 items-center justify-center rounded-full"
                style={{ background: `conic-gradient(#22c55e 0 ${confirmedPercent}%, #334155 ${confirmedPercent}% 100%)` }}
              >
                <div className="flex h-32 w-32 flex-col items-center justify-center rounded-full bg-slate-900">
                  <span className="text-4xl font-black">{confirmedCount}</span>
                  <span className="text-sm text-slate-400">confirmed</span>
                </div>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 text-center">
              <Stat label="Confirmed" value={String(confirmedCount)} tone="green" />
              <Stat label="Waiting" value={String(waitingCount)} tone="slate" />
            </div>
          </div>

          <div className="rounded-3xl bg-slate-900 p-6">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-sm text-slate-400">Voting Progress</p>
                <p className="mt-1 text-3xl font-black">{confirmedCount} / {totalPlayers}</p>
              </div>
              <p className="text-2xl font-black text-green-300">{confirmedPercent}%</p>
            </div>
            <div className="mt-5 h-5 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-green-500 transition-all duration-300" style={{ width: `${confirmedPercent}%` }} />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-green-500/10 p-4">
                <p className="text-sm text-green-300">Confirmed Players</p>
                <p className="mt-1 text-2xl font-bold">{confirmedCount}</p>
              </div>
              <div className="rounded-2xl bg-slate-800 p-4">
                <p className="text-sm text-slate-400">Not Confirmed Yet</p>
                <p className="mt-1 text-2xl font-bold">{waitingCount}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-3xl bg-slate-900 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-2xl font-bold">Tap Your Name</h2>
              <p className="mt-1 text-sm text-slate-400">Green means confirmed.</p>
            </div>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search your name..."
              className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-3"
            />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {filteredPlayers.map((player) => {
              const confirmed = confirmedPlayerIds.has(player.id);
              const busy = busyPlayerId === player.id;
              return (
                <button
                  type="button"
                  key={player.id}
                  onClick={() => toggleVote(player)}
                  disabled={!votingOpen || deadlinePassed || busy}
                  className={`flex min-h-20 items-center justify-between gap-3 rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-70 ${
                    confirmed
                      ? "border-green-400 bg-green-500/20"
                      : "border-slate-700 bg-slate-800"
                  }`}
                >
                  <span className="font-semibold">{player.name}</span>
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-lg ${confirmed ? "border-green-300 bg-green-400 text-slate-950" : "border-slate-500 text-slate-400"}`}>
                    {busy ? "…" : confirmed ? "✓" : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-6 grid gap-5 md:grid-cols-2">
          <PlayerList title={`✅ Confirmed (${confirmedCount})`} players={confirmedPlayers} emptyText="Nobody has confirmed yet." confirmed />
          <PlayerList title={`⏳ Waiting (${waitingCount})`} players={waitingPlayers} emptyText="Everyone has confirmed." />
        </section>

        {isAdmin && (
          <section className="mt-6 rounded-3xl border border-blue-500/30 bg-blue-500/10 p-6">
            <h2 className="text-2xl font-bold text-blue-200">Admin Controls</h2>
            <p className="mt-1 text-sm text-slate-300">Importing confirmed players adds them to the session automatically.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              {votingOpen && (
                <button type="button" onClick={closeVoting} disabled={adminBusy} className="rounded-xl border border-yellow-400 px-5 py-3 font-semibold text-yellow-200 disabled:opacity-50">Close Voting</button>
              )}
              <button type="button" onClick={importConfirmedPlayers} disabled={adminBusy || confirmedCount === 0} className="rounded-xl bg-blue-500 px-5 py-3 font-semibold text-white disabled:opacity-50">
                {adminBusy ? "Working..." : `Create Session with ${confirmedCount} Players`}
              </button>
              <a href={`/sessions/${sessionId}`} className="rounded-xl border border-slate-500 px-5 py-3 text-slate-200">Open Session</a>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function PlayerList({ title, players, emptyText, confirmed = false }: { title: string; players: Player[]; emptyText: string; confirmed?: boolean }) {
  return (
    <div className="rounded-3xl bg-slate-900 p-6">
      <h3 className="text-xl font-bold">{title}</h3>
      {players.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">{emptyText}</p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {players.map((player) => (
            <span key={player.id} className={`rounded-full px-3 py-2 text-sm ${confirmed ? "bg-green-500/20 text-green-200" : "bg-slate-800 text-slate-300"}`}>
              {confirmed ? "✓ " : ""}{player.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "green" | "slate" }) {
  return (
    <div className={`rounded-2xl p-3 ${tone === "green" ? "bg-green-500/10" : "bg-slate-800"}`}>
      <p className={`text-xs ${tone === "green" ? "text-green-300" : "text-slate-400"}`}>{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}