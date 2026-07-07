"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function VideosPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [openMatchId, setOpenMatchId] = useState<string | null>(null);

  async function loadSessions() {
    const { data } = await supabase
      .from("sessions")
      .select(`
        *,
        turfs (*),
        matches (*)
      `)
      .order("session_date", { ascending: false });

    const withVideos =
      data?.filter((session: any) =>
        session.matches?.some((match: any) => match.youtube_video_id)
      ) || [];

    setSessions(withVideos);

    if (withVideos.length > 0 && !selectedDate) {
      setSelectedDate(withVideos[0].session_date);
    }
  }

  useEffect(() => {
    loadSessions();
  }, []);

  const availableDates = useMemo(() => {
    return sessions.map((session) => session.session_date);
  }, [sessions]);

  const selectedSession = sessions.find(
    (session) => session.session_date === selectedDate
  );

  const videoMatches =
    selectedSession?.matches?.filter((match: any) => match.youtube_video_id) ||
    [];

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mx-auto max-w-6xl">
        <Link href="/" className="text-sm text-slate-400">
          ← Back to Dashboard
        </Link>

        <h1 className="mt-4 text-4xl font-bold">📹 Cricket Video Archive</h1>
        <p className="mt-2 text-slate-300">
          Select a date to watch only that day&apos;s match videos.
        </p>

        <section className="mt-8 rounded-3xl bg-slate-900 p-6">
          <h2 className="text-2xl font-bold">🗓️ Select Match Date</h2>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setOpenMatchId(null);
              }}
              className="rounded-xl border border-slate-700 bg-slate-800 p-3"
            />

            <select
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setOpenMatchId(null);
              }}
              className="rounded-xl border border-slate-700 bg-slate-800 p-3"
            >
              {availableDates.map((date) => (
                <option key={date} value={date}>
                  {new Date(date).toLocaleDateString("en-IN", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </option>
              ))}
            </select>
          </div>

          {sessions.length === 0 && (
            <p className="mt-5 text-slate-400">No videos added yet.</p>
          )}
        </section>

        {selectedSession && (
          <section className="mt-8 rounded-3xl bg-slate-900 p-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm text-slate-400">
                  {new Date(selectedSession.session_date).toLocaleDateString(
                    "en-IN",
                    {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    }
                  )}
                </p>

                <h2 className="mt-2 text-3xl font-bold">
                  {selectedSession.session_name}
                </h2>

                <p className="mt-1 text-slate-400">
                  📍 {selectedSession.turfs?.name}
                </p>
              </div>

              <div className="rounded-xl bg-green-500 px-4 py-3 font-bold text-slate-950">
                🎥 {videoMatches.length} video{videoMatches.length !== 1 ? "s" : ""}
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {videoMatches.length === 0 && (
                <p className="text-slate-400">
                  No videos found for this selected date.
                </p>
              )}

              {videoMatches.map((match: any) => {
                const isOpen = openMatchId === match.id;

                return (
                  <div key={match.id} className="rounded-xl bg-slate-800 p-4">
                    <button
                      onClick={() => setOpenMatchId(isOpen ? null : match.id)}
                      className="flex w-full items-center justify-between gap-4 text-left"
                    >
                      <span className="font-semibold">
                        {isOpen ? "▼" : "▶"} Match {match.match_number}:{" "}
                        {match.team_a || "Team A"} vs {match.team_b || "Team B"}
                      </span>

                      <span className="text-sm text-green-300">
                        {match.team_a_runs}/{match.team_a_wickets} vs{" "}
                        {match.team_b_runs}/{match.team_b_wickets}
                      </span>
                    </button>

                    {isOpen && (
                      <div className="mt-4 border-t border-slate-700 pt-4">
                        <p className="font-semibold text-green-300">
                          🏆 Winner: {match.winner || "-"}
                        </p>

                        {match.player_of_match && (
                          <p className="mt-2 text-yellow-300">
                            ⭐ Player of Match: {match.player_of_match}
                          </p>
                        )}

                        <div className="mt-4 overflow-hidden rounded-xl border border-slate-700">
                          <iframe
                            className="aspect-video w-full"
                            src={`https://www.youtube.com/embed/${match.youtube_video_id}`}
                            title={`Match ${match.match_number}`}
                            allowFullScreen
                          />
                        </div>

                        {match.match_notes && (
                          <p className="mt-4 text-sm text-slate-300">
                            {match.match_notes}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}