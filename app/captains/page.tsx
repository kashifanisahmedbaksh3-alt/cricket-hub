"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type CaptainStat = {
  name: string;
  total: number;
  recentCount: number;
  lastDate: string | null;
  sessionsSinceCaptain: number;
  score: number;
};

export default function CaptainsPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [captainA, setCaptainA] = useState("");
  const [captainB, setCaptainB] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadSessions() {
    setLoading(true);

    const { data, error } = await supabase
      .from("sessions")
      .select(`
        *,
        turfs (*),
        session_players (
          *,
          players (*)
        )
      `)
      .order("session_date", { ascending: false });

    setLoading(false);

    if (error) {
      alert(error.message);
      return;
    }

    const rows = data || [];
    setSessions(rows);

    const today = new Date().toISOString().slice(0, 10);

    const upcoming = [...rows]
      .filter((session: any) => session.session_date >= today)
      .sort((a: any, b: any) =>
        a.session_date.localeCompare(b.session_date)
      );

    if (upcoming.length > 0) {
      const currentSelectionStillValid = upcoming.some(
        (session: any) => session.id === selectedSessionId
      );

      if (!currentSelectionStillValid) {
        const nextSession = upcoming[0];

        setSelectedSessionId(nextSession.id);
        setCaptainA(nextSession.captain_a || "");
        setCaptainB(nextSession.captain_b || "");
      }
    } else {
      setSelectedSessionId("");
      setCaptainA("");
      setCaptainB("");
    }
  }

  useEffect(() => {
    loadSessions();
  }, []);

  const today = new Date().toISOString().slice(0, 10);

  const upcomingSessions = useMemo(() => {
    return sessions
      .filter(
        (session: any) =>
          session.session_date >= today
      )
      .sort((a: any, b: any) =>
        a.session_date.localeCompare(b.session_date)
      );
  }, [sessions, today]);

  const selectedSession = useMemo(
    () =>
      upcomingSessions.find(
        (session: any) =>
          session.id === selectedSessionId
      ),
    [upcomingSessions, selectedSessionId]
  );

  const confirmedPlayers = useMemo(() => {
    const names =
      selectedSession?.session_players
        ?.map((row: any) => row.players?.name)
        .filter(Boolean) || [];

    return [...new Set(names)] as string[];
  }, [selectedSession]);

  /*
   * This history is always available,
   * whether or not a future session exists.
   */
  const captainHistory = useMemo(() => {
    return sessions
      .filter(
        (session: any) =>
          session.captain_a ||
          session.captain_b
      )
      .sort((a: any, b: any) =>
        b.session_date.localeCompare(a.session_date)
      );
  }, [sessions]);

  /*
   * Only sessions BEFORE the selected upcoming session
   * are used to calculate recommendations.
   */
  const previousSessions = useMemo(() => {
    if (!selectedSession) return captainHistory;

    return captainHistory.filter(
      (session: any) =>
        session.id !== selectedSession.id &&
        session.session_date < selectedSession.session_date
    );
  }, [captainHistory, selectedSession]);

 
const captainStats: CaptainStat[] = useMemo(() => {
  return confirmedPlayers
    .map((name: string) => {
      const allCaptainSessions = previousSessions.filter(
        (session: any) =>
          session.captain_a === name ||
          session.captain_b === name
      );

      const total = allCaptainSessions.length;

      const recentCount = previousSessions
        .slice(0, 4)
        .filter(
          (session: any) =>
            session.captain_a === name ||
            session.captain_b === name
        ).length;

      const lastDate =
        allCaptainSessions.length > 0
          ? allCaptainSessions.reduce(
              (latest: string, session: any) =>
                session.session_date > latest
                  ? session.session_date
                  : latest,
              allCaptainSessions[0].session_date
            )
          : null;

      const lastCaptainIndex = previousSessions.findIndex(
        (session: any) =>
          session.captain_a === name ||
          session.captain_b === name
      );

      const sessionsSinceCaptain =
        lastCaptainIndex === -1
          ? previousSessions.length + 1
          : lastCaptainIndex;

      return {
        name,
        total,
        recentCount,
        lastDate,
        sessionsSinceCaptain,
        score: 0,
      };
    })
    .sort((a, b) => {
      // First priority: never captained.
      if (a.lastDate === null && b.lastDate !== null) {
        return -1;
      }

      if (b.lastDate === null && a.lastDate !== null) {
        return 1;
      }

      // Second priority: oldest captaincy first.
      if (a.lastDate && b.lastDate) {
        const dateOrder = a.lastDate.localeCompare(b.lastDate);

        if (dateOrder !== 0) {
          return dateOrder;
        }
      }

      // Third priority: fewer total captaincies.
      if (a.total !== b.total) {
        return a.total - b.total;
      }

      // Final deterministic tie-breaker.
      return a.name.localeCompare(b.name);
    });
}, [confirmedPlayers, previousSessions]);


  const recommendedPair = useMemo(() => {
    if (captainStats.length < 2) {
      return [];
    }

    const first = captainStats[0];

    const previousPair =
      previousSessions[0];

    const secondCandidates =
      captainStats.slice(1);

    /*
     * Avoid repeating the exact same captain pairing
     * as the last session whenever possible.
     */
    const second =
      secondCandidates.find((candidate) => {
        if (!previousPair) {
          return true;
        }

        const repeatedPair =
          (previousPair.captain_a === first.name &&
            previousPair.captain_b ===
              candidate.name) ||
          (previousPair.captain_b === first.name &&
            previousPair.captain_a ===
              candidate.name);

        return !repeatedPair;
      }) || secondCandidates[0];

    return second
      ? [first, second]
      : [first];
  }, [captainStats, previousSessions]);

  function useRecommendedCaptains() {
    if (recommendedPair.length < 2) {
      alert(
        "At least 2 confirmed players are needed."
      );
      return;
    }

    setCaptainA(recommendedPair[0].name);
    setCaptainB(recommendedPair[1].name);
  }

  async function saveCaptains() {
    if (!selectedSession) {
      alert("Please select an upcoming session.");
      return;
    }

    if (!captainA || !captainB) {
      alert("Please select both captains.");
      return;
    }

    if (captainA === captainB) {
      alert(
        "Captain A and Captain B cannot be the same player."
      );
      return;
    }

    setSaving(true);

    const { error } = await supabase
      .from("sessions")
      .update({
        captain_a: captainA,
        captain_b: captainB,
      })
      .eq("id", selectedSession.id);

    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    alert("Captains saved successfully!");

    await loadSessions();
  }

  function formatDate(
    date: string | null
  ) {
    if (!date) return "-";

    const [year, month, day] =
      date.split("-");

    return `${day}-${month}-${year}`;
  }

  
function rotationLabel(stat: CaptainStat) {
  if (stat.total === 0) {
    return {
      label: "Very High",
      className: "text-green-300",
      reason: "Never captained - first priority",
    };
  }

  return {
    label: "Date Based",
    className: "text-cyan-300",
    reason: `Last captained: ${formatDate(stat.lastDate)}. Ranked by oldest captaincy first.`,
  };
}


  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        <div className="mx-auto max-w-7xl">
          Loading Captain Centre...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-white sm:p-6">
      <div className="mx-auto max-w-7xl">
        <Link
          href="/"
          className="text-sm text-slate-400 hover:text-white"
        >
          ← Back to Dashboard
        </Link>

        <h1 className="mt-4 text-3xl font-bold sm:text-4xl">
          👑 Ittehad Captain Centre
        </h1>

        <p className="mt-2 text-slate-300">
          Captain history, fair rotation and
          recommendations for upcoming sessions.
        </p>

        {/* UPCOMING SESSION */}

        <section className="mt-8 rounded-3xl bg-slate-900 p-5 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold">
                🗓️ Upcoming Session
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                Recommendations are generated only
                for future sessions.
              </p>
            </div>

            {selectedSession && (
              <span className="rounded-full bg-green-500/15 px-3 py-2 text-xs font-semibold text-green-300">
                {confirmedPlayers.length} Players
              </span>
            )}
          </div>

          <select
            value={selectedSessionId}
            onChange={(event) => {
              const id =
                event.target.value;

              setSelectedSessionId(id);

              const session =
                upcomingSessions.find(
                  (row: any) =>
                    row.id === id
                );

              setCaptainA(
                session?.captain_a || ""
              );

              setCaptainB(
                session?.captain_b || ""
              );
            }}
            className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-800 p-3"
          >
            <option value="">
              {upcomingSessions.length > 0
                ? "Select upcoming session"
                : "No upcoming session created"}
            </option>

            {upcomingSessions.map(
              (session: any) => (
                <option
                  key={session.id}
                  value={session.id}
                >
                  {formatDate(
                    session.session_date
                  )}{" "}
                  - {session.session_name} -{" "}
                  {session.turfs?.name ||
                    "No Turf"}
                </option>
              )
            )}
          </select>
        </section>

        {/* NO UPCOMING SESSION */}

        {upcomingSessions.length === 0 && (
          <section className="mt-6 rounded-3xl border border-yellow-500/30 bg-yellow-500/10 p-6">
            <h2 className="text-xl font-bold text-yellow-200">
              🗓️ Next Session Not Created Yet
            </h2>

            <p className="mt-2 text-slate-300">
              Captain recommendations will become
              available automatically once the next
              session is created and players are
              added.
            </p>

            <p className="mt-2 text-sm text-slate-400">
              Captain History and Captaincy Summary
              remain available below.
            </p>

            <Link
              href="/sessions"
              className="mt-5 inline-block rounded-xl bg-green-500 px-5 py-3 font-semibold text-slate-950"
            >
              Go to Sessions
            </Link>
          </section>
        )}

        {/* UPCOMING SESSION FEATURES */}

        {selectedSession && (
          <>
            {/* SUGGESTED CAPTAINS */}

            <section className="mt-6 rounded-3xl border border-green-500/30 bg-gradient-to-br from-green-500/10 to-slate-900 p-5 sm:p-6">
              <p className="text-sm font-semibold uppercase tracking-wider text-green-300">
                Recommended for this session
              </p>

              <h2 className="mt-2 text-2xl font-bold">
                👑 Suggested Captains
              </h2>

              {recommendedPair.length >= 2 ? (
                <>
                  <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <CaptainHero
                      name={
                        recommendedPair[0].name
                      }
                      stat={
                        recommendedPair[0]
                      }
                    />

                    <div className="font-black text-slate-500">
                      VS
                    </div>

                    <CaptainHero
                      name={
                        recommendedPair[1].name
                      }
                      stat={
                        recommendedPair[1]
                      }
                    />
                  </div>

                  <button
                    type="button"
                    onClick={
                      useRecommendedCaptains
                    }
                    className="mt-6 w-full rounded-xl bg-green-500 px-5 py-3 font-bold text-slate-950 sm:w-auto"
                  >
                    Use Recommended Pair
                  </button>
                </>
              ) : (
                <p className="mt-4 text-slate-400">
                  Add at least two players to this
                  session to generate captain
                  recommendations.
                </p>
              )}
            </section>

            {/* ROTATION */}

            <section className="mt-6 rounded-3xl bg-slate-900 p-5 sm:p-6">
              <h2 className="text-2xl font-bold">
                🏏 Captaincy Rotation
              </h2>

              <p className="mt-2 text-sm text-slate-400">
                Only players currently added to this
                upcoming session are considered.
              </p>

              <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {captainStats.map(
                  (
                    stat: CaptainStat,
                    index: number
                  ) => {
                    const rotation =
                      rotationLabel(stat);

                    return (
                      <div
                        key={stat.name}
                        className="rounded-2xl border border-slate-700 bg-slate-800 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs text-slate-500">
                              Rank #
                              {index + 1}
                            </p>

                            <h3 className="mt-1 text-lg font-bold">
                              {stat.name}
                            </h3>
                          </div>

                          <span
                            className={`text-sm font-bold ${rotation.className}`}
                          >
                            {
                              rotation.label
                            }
                          </span>
                        </div>

                        <div className="mt-4 space-y-1 text-sm text-slate-300">
                          <p>
                            Captaincies:{" "}
                            <strong>
                              {stat.total}
                            </strong>
                          </p>

                          <p>
                            Recent captaincies:{" "}
                            <strong>
                              {
                                stat.recentCount
                              }
                            </strong>
                          </p>

                          <p>
                            Last captained:{" "}
                            <strong>
                              {formatDate(
                                stat.lastDate
                              )}
                            </strong>
                          </p>
                        </div>

                        <p className="mt-3 text-xs text-slate-500">
                          {rotation.reason}
                        </p>
                      </div>
                    );
                  }
                )}
              </div>
            </section>

            {/* FINAL SELECTION */}

            <section className="mt-6 rounded-3xl bg-slate-900 p-5 sm:p-6">
              <h2 className="text-2xl font-bold">
                👑 Final Captain Selection
              </h2>

              <p className="mt-2 text-sm text-slate-400">
                Accept the recommendation or choose
                the captains manually.
              </p>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm text-slate-300">
                    Captain A
                  </label>

                  <select
                    value={captainA}
                    onChange={(event) =>
                      setCaptainA(
                        event.target.value
                      )
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3"
                  >
                    <option value="">
                      Select Captain A
                    </option>

                    {confirmedPlayers.map(
                      (name: string) => (
                        <option
                          key={name}
                          value={name}
                          disabled={
                            name === captainB
                          }
                        >
                          {name}
                        </option>
                      )
                    )}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-300">
                    Captain B
                  </label>

                  <select
                    value={captainB}
                    onChange={(event) =>
                      setCaptainB(
                        event.target.value
                      )
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3"
                  >
                    <option value="">
                      Select Captain B
                    </option>

                    {confirmedPlayers.map(
                      (name: string) => (
                        <option
                          key={name}
                          value={name}
                          disabled={
                            name === captainA
                          }
                        >
                          {name}
                        </option>
                      )
                    )}
                  </select>
                </div>
              </div>

              <button
                type="button"
                onClick={saveCaptains}
                disabled={
                  saving ||
                  !captainA ||
                  !captainB ||
                  captainA === captainB
                }
                className="mt-5 w-full rounded-xl bg-blue-500 px-5 py-3 font-bold text-white disabled:opacity-40 sm:w-auto"
              >
                {saving
                  ? "Saving..."
                  : "Save Captains to Session"}
              </button>
            </section>
          </>
        )}

        {/* HISTORY — ALWAYS VISIBLE */}

        <section className="mt-8 rounded-3xl bg-slate-900 p-5 sm:p-6">
          <h2 className="text-2xl font-bold">
            📜 Captain History
          </h2>

          <p className="mt-2 text-sm text-slate-400">
            Automatically generated from captains
            saved against previous sessions.
          </p>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[700px] text-left">
              <thead>
                <tr className="border-b border-slate-700 text-sm text-slate-400">
                  <th className="px-3 py-3">
                    Date
                  </th>

                  <th className="px-3 py-3">
                    Session
                  </th>

                  <th className="px-3 py-3">
                    Turf
                  </th>

                  <th className="px-3 py-3">
                    Captain A
                  </th>

                  <th className="px-3 py-3">
                    Captain B
                  </th>
                </tr>
              </thead>

              <tbody>
                {captainHistory.map(
                  (session: any) => (
                    <tr
                      key={session.id}
                      className="border-b border-slate-800"
                    >
                      <td className="px-3 py-4 font-semibold">
                        {formatDate(
                          session.session_date
                        )}
                      </td>

                      <td className="px-3 py-4 text-slate-300">
                        {
                          session.session_name
                        }
                      </td>

                      <td className="px-3 py-4 text-slate-400">
                        {session.turfs?.name ||
                          "-"}
                      </td>

                      <td className="px-3 py-4">
                        <span className="rounded-lg bg-blue-500/15 px-3 py-2 font-semibold text-blue-300">
                          {session.captain_a ||
                            "-"}
                        </span>
                      </td>

                      <td className="px-3 py-4">
                        <span className="rounded-lg bg-green-500/15 px-3 py-2 font-semibold text-green-300">
                          {session.captain_b ||
                            "-"}
                        </span>
                      </td>
                    </tr>
                  )
                )}

                {captainHistory.length ===
                  0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-8 text-center text-slate-500"
                    >
                      No captain history available
                      yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* SUMMARY — ALWAYS VISIBLE */}

        <CaptainSummary
          sessions={captainHistory}
          formatDate={formatDate}
        />
      </div>
    </main>
  );
}

function CaptainHero({
  name,
  stat,
}: {
  name: string;
  stat: CaptainStat;
}) {
  return (
    <div className="rounded-2xl border border-green-500/20 bg-slate-900 p-4 text-center">
      <div className="text-3xl">
        👑
      </div>

      <p className="mt-2 text-lg font-black sm:text-2xl">
        {name}
      </p>

      <p className="mt-1 text-xs text-slate-400">
        {stat.total === 0
          ? "New captain opportunity"
          : `${stat.total} previous captaincy ${
              stat.total === 1
                ? "session"
                : "sessions"
            }`}
      </p>
    </div>
  );
}

function CaptainSummary({
  sessions,
  formatDate,
}: {
  sessions: any[];
  formatDate: (
    date: string | null
  ) => string;
}) {
  const stats = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        count: number;
        lastDate: string;
      }
    >();

    sessions.forEach(
      (session: any) => {
        [
          session.captain_a,
          session.captain_b,
        ]
          .filter(Boolean)
          .forEach((name: string) => {
            const current =
              map.get(name);

            if (!current) {
              map.set(name, {
                name,
                count: 1,
                lastDate:
                  session.session_date,
              });

              return;
            }

            current.count += 1;

            if (
              session.session_date >
              current.lastDate
            ) {
              current.lastDate =
                session.session_date;
            }
          });
      }
    );

    return [...map.values()].sort(
      (a, b) =>
        b.count - a.count ||
        b.lastDate.localeCompare(
          a.lastDate
        )
    );
  }, [sessions]);

  return (
    <section className="mt-6 rounded-3xl bg-slate-900 p-5 sm:p-6">
      <h2 className="text-2xl font-bold">
        🏆 Captaincy Summary
      </h2>

      <p className="mt-2 text-sm text-slate-400">
        All-time captaincy appearances based on
        saved session history.
      </p>

      <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {stats.map(
          (captain, index) => (
            <div
              key={captain.name}
              className="rounded-2xl border border-slate-700 bg-slate-800 p-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-bold">
                  {captain.name}
                </h3>

                <span className="text-sm text-slate-500">
                  #{index + 1}
                </span>
              </div>

              <p className="mt-3 text-2xl font-black">
                {captain.count}
              </p>

              <p className="text-xs text-slate-400">
                Times captained
              </p>

              <p className="mt-3 text-xs text-slate-500">
                Latest:{" "}
                {formatDate(
                  captain.lastDate
                )}
              </p>
            </div>
          )
        )}

        {stats.length === 0 && (
          <p className="text-slate-400">
            No captaincy history available yet.
          </p>
        )}
      </div>
    </section>
  );
}