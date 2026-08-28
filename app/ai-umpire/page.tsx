"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import CameraUmpire from "../ai-umpire-v2/components/CameraUmpire";

type Session = {
  id: string;
  session_date: string;
  session_name: string | null;
  team_a_name?: string | null;
  team_b_name?: string | null;
  turfs?: {
    name?: string | null;
  } | null;
  matches?: Match[];
};

type Match = {
  id: string;
  match_number: number;
  team_a: string | null;
  team_b: string | null;
  match_status: string | null;
  current_innings?: number | null;
  team_a_runs?: number | null;
  team_a_wickets?: number | null;
  team_b_runs?: number | null;
  team_b_wickets?: number | null;
  overs?: number | null;
};

export default function AIUmpirePage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [selectedMatchId, setSelectedMatchId] = useState("");
  const [loading, setLoading] = useState(true);

  const [lastDecision, setLastDecision] = useState<any>(null);

  useEffect(() => {
    loadSessions();
  }, []);

  async function loadSessions() {
    setLoading(true);

    const { data, error } = await supabase
      .from("sessions")
      .select(`
        id,
        session_date,
        session_name,
        team_a_name,
        team_b_name,
        turfs (
          name
        ),
        matches (
          id,
          match_number,
          team_a,
          team_b,
          match_status,
          current_innings,
          team_a_runs,
          team_a_wickets,
          team_b_runs,
          team_b_wickets,
          overs
        )
      `)
      .order("session_date", { ascending: false });

    setLoading(false);

    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }

    const rows = (data || []) as Session[];

    setSessions(rows);

    if (rows.length > 0) {
      const today = new Date()
        .toISOString()
        .slice(0, 10);

      const upcomingOrToday = [...rows]
        .filter(
          (session) =>
            session.session_date >= today
        )
        .sort((a, b) =>
          a.session_date.localeCompare(
            b.session_date
          )
        );

      const defaultSession =
        upcomingOrToday[0] || rows[0];

      setSelectedSessionId(
        defaultSession.id
      );

      if (
        defaultSession.matches &&
        defaultSession.matches.length > 0
      ) {
        const sortedMatches = [
          ...defaultSession.matches,
        ].sort(
          (a, b) =>
            Number(a.match_number) -
            Number(b.match_number)
        );

        setSelectedMatchId(
          sortedMatches[0].id
        );
      }
    }
  }

  const selectedSession =
    useMemo(() => {
      return sessions.find(
        (session) =>
          session.id ===
          selectedSessionId
      );
    }, [
      sessions,
      selectedSessionId,
    ]);

  const matches = useMemo(() => {
    return [
      ...(selectedSession?.matches ||
        []),
    ].sort(
      (a, b) =>
        Number(a.match_number) -
        Number(b.match_number)
    );
  }, [selectedSession]);

  const selectedMatch =
    useMemo(() => {
      return matches.find(
        (match) =>
          match.id ===
          selectedMatchId
      );
    }, [matches, selectedMatchId]);

  function handleSessionChange(
    sessionId: string
  ) {
    setSelectedSessionId(sessionId);
    setSelectedMatchId("");
    setLastDecision(null);

    const session = sessions.find(
      (row) => row.id === sessionId
    );

    const sessionMatches = [
      ...(session?.matches || []),
    ].sort(
      (a, b) =>
        Number(a.match_number) -
        Number(b.match_number)
    );

    if (sessionMatches.length > 0) {
      setSelectedMatchId(
        sessionMatches[0].id
      );
    }
  }

  function handleCameraDecision(
    decision: any
  ) {
    /*
     * STAGE 1:
     * Review only.
     *
     * We deliberately DO NOT write
     * anything to ball_events yet.
     */
    setLastDecision(decision);

    console.log(
      "Camera Umpire decision:",
      decision
    );
  }

  function formatDate(
    date: string
  ) {
    if (!date) return "-";

    const [year, month, day] =
      date.split("-");

    return `${day}-${month}-${year}`;
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        <div className="mx-auto max-w-5xl">
          Loading AI Umpire...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-white sm:p-6">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="text-sm text-slate-400 hover:text-white"
          >
            ← Back to Dashboard
          </Link>

          <Link
            href="/ai-umpire-v2"
            className="rounded-xl border border-green-500/40 px-4 py-2 text-sm font-semibold text-green-300"
          >
            🏏 Open Live Scorer
          </Link>
        </div>

        <section className="mt-5 rounded-3xl border border-purple-500/30 bg-gradient-to-br from-purple-500/10 via-slate-900 to-slate-900 p-5 sm:p-7">
          <p className="text-sm font-bold uppercase tracking-widest text-purple-300">
            Ittehad Cricket
          </p>

          <h1 className="mt-2 text-3xl font-black sm:text-4xl">
            🤖 AI Umpire
          </h1>

          <p className="mt-2 max-w-2xl text-sm text-slate-300 sm:text-base">
            Dedicated camera review for
            deliveries, slow-motion replay
            and umpire decisions.
          </p>

          <div className="mt-4 inline-flex rounded-full bg-yellow-500/10 px-3 py-2 text-xs font-semibold text-yellow-300">
            Stage 1 • Review Mode
          </div>
        </section>

        {/* SESSION */}

        <section className="mt-5 rounded-3xl bg-slate-900 p-5">
          <h2 className="text-lg font-bold">
            🗓️ Select Session
          </h2>

          <select
            value={selectedSessionId}
            onChange={(event) =>
              handleSessionChange(
                event.target.value
              )
            }
            className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-800 p-3"
          >
            <option value="">
              Select session
            </option>

            {sessions.map(
              (session) => (
                <option
                  key={session.id}
                  value={session.id}
                >
                  {formatDate(
                    session.session_date
                  )}{" "}
                  -{" "}
                  {session.session_name ||
                    "Cricket"}{" "}
                  -{" "}
                  {session.turfs?.name ||
                    "Turf"}
                </option>
              )
            )}
          </select>
        </section>

        {/* MATCH */}

        {selectedSession && (
          <section className="mt-5 rounded-3xl bg-slate-900 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">
                  🏏 Select Match
                </h2>

                <p className="mt-1 text-xs text-slate-400">
                  {
                    selectedSession.team_a_name
                  }{" "}
                  vs{" "}
                  {
                    selectedSession.team_b_name
                  }
                </p>
              </div>

              <span className="rounded-full bg-slate-800 px-3 py-2 text-xs text-slate-300">
                {matches.length}{" "}
                {matches.length === 1
                  ? "Match"
                  : "Matches"}
              </span>
            </div>

            {matches.length > 0 ? (
              <select
                value={selectedMatchId}
                onChange={(event) => {
                  setSelectedMatchId(
                    event.target.value
                  );

                  setLastDecision(
                    null
                  );
                }}
                className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-800 p-3"
              >
                {matches.map(
                  (match) => (
                    <option
                      key={match.id}
                      value={match.id}
                    >
                      Match{" "}
                      {
                        match.match_number
                      }{" "}
                      -{" "}
                      {match.team_a ||
                        "Team A"}{" "}
                      vs{" "}
                      {match.team_b ||
                        "Team B"}
                    </option>
                  )
                )}
              </select>
            ) : (
              <div className="mt-3 rounded-xl bg-yellow-500/10 p-4 text-sm text-yellow-200">
                No match has been created
                for this session yet.
              </div>
            )}
          </section>
        )}

        {/* MATCH STATUS */}

        {selectedMatch && (
          <>
            <section className="mt-5 rounded-3xl bg-slate-900 p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wider text-slate-500">
                    Current Match
                  </p>

                  <h2 className="mt-1 text-xl font-black">
                    {selectedMatch.team_a ||
                      "Team A"}{" "}
                    vs{" "}
                    {selectedMatch.team_b ||
                      "Team B"}
                  </h2>

                  <p className="mt-1 text-sm text-slate-400">
                    Match{" "}
                    {
                      selectedMatch.match_number
                    }{" "}
                    •{" "}
                    {selectedMatch.overs ||
                      "-"}{" "}
                    overs
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-2xl font-black">
                    {Number(
                      selectedMatch.team_a_runs ||
                        0
                    )}
                    /
                    {Number(
                      selectedMatch.team_a_wickets ||
                        0
                    )}
                  </p>

                  <p className="text-xs text-slate-400">
                    Team A
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-2xl font-black">
                    {Number(
                      selectedMatch.team_b_runs ||
                        0
                    )}
                    /
                    {Number(
                      selectedMatch.team_b_wickets ||
                        0
                    )}
                  </p>

                  <p className="text-xs text-slate-400">
                    Team B
                  </p>
                </div>
              </div>
            </section>

            {/* CAMERA */}

            <section className="mt-5">
              <CameraUmpire
                disabled={
                  selectedMatch.match_status ===
                  "completed"
                }
                onDecision={
                  handleCameraDecision
                }
              />
            </section>

            {/* REVIEW RESULT */}

            {lastDecision && (
              <section className="mt-5 rounded-3xl border border-blue-500/30 bg-blue-500/10 p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-blue-300">
                  Latest Camera Review
                </p>

                <h2 className="mt-2 text-2xl font-black">
                  {String(
                    lastDecision.decision ||
                      lastDecision.type ||
                      "Review"
                  ).toUpperCase()}
                </h2>

                {lastDecision.confidence !==
                  undefined && (
                  <p className="mt-2 text-sm text-slate-300">
                    Confidence:{" "}
                    {Math.round(
                      Number(
                        lastDecision.confidence
                      ) * 100
                    )}
                    %
                  </p>
                )}

                <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-yellow-200">
                  Review only — this decision
                  has NOT changed the live
                  score.
                </div>
              </section>
            )}
          </>
        )}

        <section className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-sm font-semibold text-slate-300">
            Stage 1 Safety
          </p>

          <p className="mt-1 text-xs leading-5 text-slate-500">
            Camera decisions on this page
            are intentionally isolated from
            live scoring while we test the
            standalone umpire workflow.
          </p>
        </section>
      </div>
    </main>
  );
}