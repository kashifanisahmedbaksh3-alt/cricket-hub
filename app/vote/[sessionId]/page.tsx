"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";

const SAVED_MOBILE_KEY = "cricketHubVerifiedMobile";

type Vote = {
  id: string;
  player_id: string;
  vote: "yes" | "no";
  players?: { name: string } | null;
};

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

type VerifiedPlayer = {
  player_id: string;
  player_name: string;
  current_vote: "yes" | "no" | null;
};

export default function VotingPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;

  const [session, setSession] = useState<SessionData | null>(null);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [activePlayerCount, setActivePlayerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminBusy, setAdminBusy] = useState(false);

  const [mobile, setMobile] = useState("");
  const [verifiedPlayer, setVerifiedPlayer] = useState<VerifiedPlayer | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [savingVote, setSavingVote] = useState(false);

  async function loadAdminStatus() {
    const { data: { user } } = await supabase.auth.getUser();
    setIsAdmin(
      user?.email?.toLowerCase() === "kashifanisahmedbaksh3@gmail.com"
    );
  }

  async function loadVotingData(showLoader = false) {
    if (showLoader) setLoading(true);

    const [sessionResult, voteResult, countResult] = await Promise.all([
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
        .from("session_votes")
        .select(`
          id,
          player_id,
          vote,
          players (name)
        `)
        .eq("session_id", sessionId),
      supabase
        .from("players")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true),
    ]);

    if (sessionResult.error) {
      alert(sessionResult.error.message);
      setSession(null);
    } else {
      setSession(sessionResult.data as unknown as SessionData);
    }

    if (voteResult.error) {
      alert(voteResult.error.message);
    } else {
      setVotes((voteResult.data || []) as unknown as Vote[]);
    }

    setActivePlayerCount(Number(countResult.count || 0));
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

  useEffect(() => {
    const savedMobile = localStorage.getItem(SAVED_MOBILE_KEY);

    if (savedMobile) {
      setMobile(savedMobile);
      verifyMobileNumber(savedMobile, true);
    }
  }, [sessionId]);

  const confirmedVotes = useMemo(
    () => votes.filter((vote) => vote.vote === "yes"),
    [votes]
  );

  const confirmedCount = confirmedVotes.length;
  const waitingCount = Math.max(activePlayerCount - confirmedCount, 0);
  const confirmedPercent =
    activePlayerCount > 0
      ? Math.round((confirmedCount / activePlayerCount) * 100)
      : 0;

  const confirmedNames = useMemo(
    () =>
      confirmedVotes
        .map((vote) => vote.players?.name)
        .filter(Boolean) as string[],
    [confirmedVotes]
  );

  const votingOpen =
    session?.voting_enabled === true &&
    session?.voting_status === "open";

  const deadlinePassed =
    Boolean(session?.voting_deadline) &&
    new Date(session!.voting_deadline!).getTime() < Date.now();

  function normalizeMobile(value: string) {
    return value.replace(/\D/g, "").slice(-10);
  }

  async function verifyMobileNumber(
    mobileNumber: string,
    silent = false
  ) {
    const normalized = normalizeMobile(mobileNumber);

    if (normalized.length !== 10) {
      if (!silent) {
        alert("Please enter a valid 10-digit mobile number.");
      }
      return false;
    }

    setVerifying(true);

    const { data, error } = await supabase.rpc(
      "verify_session_voter",
      {
        p_session_id: sessionId,
        p_mobile: normalized,
      }
    );

    setVerifying(false);

    if (error) {
      if (!silent) {
        alert(error.message);
      }
      return false;
    }

    const result = Array.isArray(data)
      ? data[0]
      : data && typeof data === "object"
        ? data
        : null;

    if (!result) {
      localStorage.removeItem(SAVED_MOBILE_KEY);

      if (!silent) {
        alert(
          "This mobile number is not registered for any active player."
        );
      }

      return false;
    }

    setMobile(normalized);
    setVerifiedPlayer(result as VerifiedPlayer);
    localStorage.setItem(SAVED_MOBILE_KEY, normalized);
    return true;
  }

  async function verifyMobile() {
    await verifyMobileNumber(mobile);
  }

  async function submitVote(vote: "yes" | "no") {
    if (!verifiedPlayer) return;

    setSavingVote(true);

    const { data, error } = await supabase.rpc(
      "cast_session_vote_by_mobile",
      {
        p_session_id: sessionId,
        p_mobile: normalizeMobile(mobile),
        p_vote: vote,
      }
    );

    setSavingVote(false);

    if (error) {
      alert(error.message);
      return;
    }

    const result = Array.isArray(data)
      ? data[0]
      : data && typeof data === "object"
        ? data
        : null;

    setVerifiedPlayer((current) =>
      current
        ? {
            ...current,
            current_vote:
              (result?.saved_vote as "yes" | "no") || vote,
          }
        : current
    );

    await loadVotingData();

    alert(
      vote === "yes"
        ? "Your attendance is confirmed."
        : "Your response has been saved as not playing."
    );
  }

  async function shareVotingLink() {
    const url = window.location.href;

    const text = `🏏 ${session?.session_name || "Sunday Cricket"}

${formatDate(session?.session_date)}
📍 ${session?.turfs?.name || "Venue to be confirmed"}

✅ Confirmed: ${confirmedCount}
⏳ Waiting: ${waitingCount}

Enter your registered mobile number and vote:
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
    if (!confirm("Close voting?")) return;

    setAdminBusy(true);

    const { error } = await supabase
      .from("sessions")
      .update({
        voting_enabled: false,
        voting_status: "closed",
      })
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

    const existingIds = new Set(
      (existingRows || []).map((row) => row.player_id)
    );

    const rows = confirmedVotes
      .map((vote) => vote.player_id)
      .filter((playerId) => !existingIds.has(playerId))
      .map((playerId) => ({
        session_id: sessionId,
        player_id: playerId,
        amount_paid: 0,
        payment_method: null,
      }));

    if (rows.length > 0) {
      const { error } = await supabase
        .from("session_players")
        .insert(rows);

      if (error) {
        setAdminBusy(false);
        alert(error.message);
        return;
      }
    }

    const { error } = await supabase
      .from("sessions")
      .update({
        voting_enabled: false,
        voting_status: "converted",
      })
      .eq("id", sessionId);

    setAdminBusy(false);

    if (error) {
      alert(error.message);
      return;
    }

    window.location.href = `/sessions/${sessionId}`;
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        Loading voting page...
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        Voting session not found.
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 p-5 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <a href="/" className="text-sm text-slate-400">
            ← Cricket Hub
          </a>

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
            <p className="text-sm font-semibold uppercase tracking-wider text-green-300">
              One Player, One Vote
            </p>

            <h1 className="mt-2 text-4xl font-black">
              🏏 {session.session_name}
            </h1>

            <p className="mt-3 text-lg text-slate-200">
              {formatDate(session.session_date)}
            </p>

            <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-950/60 p-5">
              <p className="text-sm text-slate-400">Proposed Venue</p>
              <p className="mt-1 text-2xl font-bold">
                📍 {session.turfs?.name || "Venue to be confirmed"}
              </p>
              {session.venue_note && (
                <p className="mt-3 text-sm text-yellow-200">
                  🌧️ {session.venue_note}
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-5 md:grid-cols-[240px_1fr]">
          <div className="rounded-3xl bg-slate-900 p-6">
            <div className="flex justify-center">
              <div
                className="relative flex h-44 w-44 items-center justify-center rounded-full"
                style={{
                  background: `conic-gradient(#22c55e 0 ${confirmedPercent}%, #334155 ${confirmedPercent}% 100%)`,
                }}
              >
                <div className="flex h-32 w-32 flex-col items-center justify-center rounded-full bg-slate-900">
                  <span className="text-4xl font-black">
                    {confirmedCount}
                  </span>
                  <span className="text-sm text-slate-400">
                    confirmed
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 text-center">
              <Stat label="Confirmed" value={String(confirmedCount)} tone="green" />
              <Stat label="Waiting" value={String(waitingCount)} tone="slate" />
            </div>
          </div>

          <div className="rounded-3xl bg-slate-900 p-6">
            <p className="text-sm text-slate-400">Voting Progress</p>
            <p className="mt-1 text-3xl font-black">
              {confirmedCount} / {activePlayerCount}
            </p>

            <div className="mt-5 h-5 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-green-500"
                style={{ width: `${confirmedPercent}%` }}
              />
            </div>
          </div>
        </section>

        {votingOpen && !deadlinePassed && (
          <section className="mt-6 rounded-3xl border border-blue-500/30 bg-blue-500/10 p-6">
            {!verifiedPlayer ? (
              <>
                <h2 className="text-2xl font-bold text-blue-200">
                  Enter Your Registered Mobile Number
                </h2>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={mobile}
                    onChange={(event) =>
                      setMobile(
                        event.target.value
                          .replace(/\D/g, "")
                          .slice(0, 10)
                      )
                    }
                    placeholder="10-digit mobile number"
                    className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3"
                  />

                  <button
                    type="button"
                    onClick={verifyMobile}
                    disabled={verifying}
                    className="rounded-xl bg-blue-500 px-6 py-3 font-semibold text-white disabled:opacity-50"
                  >
                    {verifying ? "Checking..." : "Continue"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-400">Voting as</p>
                <h2 className="mt-1 text-3xl font-black text-blue-200">
                  {verifiedPlayer.player_name}
                </h2>

                {verifiedPlayer.current_vote && (
                  <p className="mt-3 text-slate-300">
                    Current response:{" "}
                    <strong>
                      {verifiedPlayer.current_vote === "yes"
                        ? "Yes, playing"
                        : "No, not playing"}
                    </strong>
                  </p>
                )}

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => submitVote("yes")}
                    disabled={savingVote}
                    className="rounded-2xl bg-green-500 px-6 py-5 text-lg font-black text-slate-950 disabled:opacity-50"
                  >
                    ✅ Yes, I&apos;m Playing
                  </button>

                  <button
                    type="button"
                    onClick={() => submitVote("no")}
                    disabled={savingVote}
                    className="rounded-2xl border border-red-400 bg-red-500/10 px-6 py-5 text-lg font-black text-red-200 disabled:opacity-50"
                  >
                    ❌ No, I Can&apos;t Play
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem(SAVED_MOBILE_KEY);
                    setVerifiedPlayer(null);
                    setMobile("");
                  }}
                  className="mt-4 text-sm text-slate-400 underline"
                >
                  Use another mobile number
                </button>
              </>
            )}
          </section>
        )}

        <section className="mt-6 rounded-3xl bg-slate-900 p-6">
          <h2 className="text-2xl font-bold">
            ✅ Confirmed Players ({confirmedCount})
          </h2>

          <div className="mt-4 flex flex-wrap gap-2">
            {confirmedNames.map((name) => (
              <span
                key={name}
                className="rounded-full bg-green-500/20 px-3 py-2 text-sm text-green-200"
              >
                ✓ {name}
              </span>
            ))}
          </div>
        </section>

        {isAdmin && (
          <section className="mt-6 rounded-3xl border border-blue-500/30 bg-blue-500/10 p-6">
            <h2 className="text-2xl font-bold text-blue-200">
              Admin Controls
            </h2>

            <div className="mt-5 flex flex-wrap gap-3">
              {votingOpen && (
                <button
                  type="button"
                  onClick={closeVoting}
                  disabled={adminBusy}
                  className="rounded-xl border border-yellow-400 px-5 py-3 font-semibold text-yellow-200"
                >
                  Close Voting
                </button>
              )}

              <button
                type="button"
                onClick={importConfirmedPlayers}
                disabled={adminBusy || confirmedCount === 0}
                className="rounded-xl bg-blue-500 px-5 py-3 font-semibold text-white disabled:opacity-50"
              >
                Create Session with {confirmedCount} Players
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "green" | "slate";
}) {
  return (
    <div
      className={`rounded-2xl p-3 ${
        tone === "green" ? "bg-green-500/10" : "bg-slate-800"
      }`}
    >
      <p className="text-xs text-slate-400">{label}</p>
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